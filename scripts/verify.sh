#!/usr/bin/env bash
# scripts/verify.sh - End-to-end verification and outage check for LedgerOne
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓ [PASS]${NC} $1"; }
fail() { echo -e "${RED}✗ [FAIL]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}ℹ [INFO]${NC} $1"; }

RUN_PIPELINE=true
RUN_SMOKE=true

for arg in "$@"; do
  case "$arg" in
    --pipeline-only) RUN_SMOKE=false ;;
    --smoke-only)    RUN_PIPELINE=false ;;
    --help|-h)
      echo "Usage: $0 [--pipeline-only | --smoke-only]"
      echo "  Runs the full verification suite (pipeline checks + live server outage smoke tests)."
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# Step 0: Development tools never read or create production .env.
if [ ! -f .env.development.local ]; then
  if [ -f .env.development.example ]; then
    info "Copying .env.development.example to .env.development.local..."
    (umask 077; cp .env.development.example .env.development.local)
    pass ".env.development.local initialized from .env.development.example"
  fi
else
  pass ".env.development.local exists"
fi

# Step 1: Verification Pipeline
if [ "$RUN_PIPELINE" = true ]; then
  info "Starting database container..."
  npm run db:up
  pass "Database is up and healthy"

  info "Generating Prisma Client..."
  npm run db:generate
  pass "Prisma client generated"

  info "Applying database migrations..."
  npm run db:migrate
  pass "Migrations applied"

  info "Checking code formatting..."
  npm run format:check
  pass "Formatting checks passed"

  info "Running linter..."
  npm run lint
  pass "Linting checks passed (0 warnings)"

  info "Running TypeScript typecheck..."
  npm run typecheck
  pass "Typecheck passed"

  info "Migrating the dedicated test database (see setup guide)..."
  npm run db:migrate:test

  info "Running unit tests..."
  npm run test:unit
  pass "Unit tests passed"

  info "Running integration tests..."
  npm run test:integration
  pass "Integration tests passed"

  info "Rehearsing the private schema and restricted database role..."
  npm run test:schema
  pass "Private-schema checks passed"

  info "Building production application..."
  npm run build
  pass "Application build succeeded"

  info "Running desktop/mobile browser regressions..."
  npm run test:e2e
  pass "Browser checks passed"

  info "Checking foundation planning documents..."
  python3 scripts/check_foundation.py
  pass "Foundation checks passed"
fi

# Step 2: Live Server & Outage Handling Smoke Test
if [ "$RUN_SMOKE" = true ]; then
  info "Running live health and database outage checks..."

  APP_PID=""
  DB_STOPPED=false
  cleanup() {
    if [ "$DB_STOPPED" = true ]; then
      npm run db:up >/dev/null 2>&1 || true
    fi
    if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
      info "Stopping test server (PID $APP_PID)..."
      kill "$APP_PID" 2>/dev/null || true
      wait "$APP_PID" 2>/dev/null || true
    fi
  }
  trap cleanup EXIT

  # Check if port 3000 is already serving LedgerOne
  if curl -s -f http://127.0.0.1:3000/api/health/live >/dev/null 2>&1; then
    info "Detected existing running instance on http://127.0.0.1:3000"
  else
    info "Starting production server on http://127.0.0.1:3000..."
    npm run start:local >/dev/null 2>&1 &
    APP_PID=$!

    # Wait for server to respond
    READY=false
    for _ in {1..30}; do
      if curl -s -f http://127.0.0.1:3000/api/health/live >/dev/null 2>&1; then
        READY=true
        break
      fi
      sleep 0.5
    done
    if [ "$READY" = false ]; then
      fail "Server failed to start on port 3000"
    fi
  fi

  # Test liveness
  LIVE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health/live)
  LIVE_BODY=$(curl -s http://127.0.0.1:3000/api/health/live)
  if [ "$LIVE_STATUS" = "200" ] && [ "$LIVE_BODY" = '{"status":"ok"}' ]; then
    pass "Liveness check passed: HTTP $LIVE_STATUS, body: $LIVE_BODY"
  else
    fail "Liveness check failed: HTTP $LIVE_STATUS, body: $LIVE_BODY"
  fi

  # Test readiness with DB up
  READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health/ready)
  READY_BODY=$(curl -s http://127.0.0.1:3000/api/health/ready)
  if [ "$READY_STATUS" = "200" ] && [ "$READY_BODY" = '{"status":"ready"}' ]; then
    pass "Readiness check (DB UP) passed: HTTP $READY_STATUS, body: $READY_BODY"
  else
    fail "Readiness check (DB UP) failed: HTTP $READY_STATUS, body: $READY_BODY"
  fi

  # Outage test: Stop DB
  info "Stopping database to simulate outage (npm run db:stop)..."
  DB_STOPPED=true
  npm run db:stop >/dev/null 2>&1

  OUTAGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health/ready)
  OUTAGE_BODY=$(curl -s http://127.0.0.1:3000/api/health/ready)
  if [ "$OUTAGE_STATUS" = "503" ] && [ "$OUTAGE_BODY" = '{"status":"unavailable"}' ]; then
    pass "Readiness check (DB DOWN) passed: HTTP $OUTAGE_STATUS, body: $OUTAGE_BODY"
  else
    fail "Readiness check (DB DOWN) failed: expected 503, got $OUTAGE_STATUS ($OUTAGE_BODY)"
  fi

  # Recovery test: Restart DB
  info "Restarting database (npm run db:up)..."
  npm run db:up >/dev/null 2>&1
  DB_STOPPED=false

  RECOVERY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health/ready)
  RECOVERY_BODY=$(curl -s http://127.0.0.1:3000/api/health/ready)
  if [ "$RECOVERY_STATUS" = "200" ] && [ "$RECOVERY_BODY" = '{"status":"ready"}' ]; then
    pass "Readiness recovery (DB RESTORED) passed: HTTP $RECOVERY_STATUS, body: $RECOVERY_BODY"
  else
    fail "Readiness recovery failed: HTTP $RECOVERY_STATUS, body: $RECOVERY_BODY"
  fi
fi

echo ""
echo -e "${GREEN}==============================================${NC}"
echo -e "${GREEN} All verification checks passed successfully! ${NC}"
echo -e "${GREEN}==============================================${NC}"
