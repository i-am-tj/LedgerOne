#!/usr/bin/env bash
# Linux CI only: use bundled browser/OS dependencies, preserving Node and DB guards.
set -euo pipefail
if [ "$(uname -s)" != Linux ]; then
  echo "This CI runner requires Linux; use npm run test:e2e for native local tests." >&2
  exit 1
fi
: "${DATABASE_URL:?Set the isolated test database profile}"
: "${DIRECT_DATABASE_URL:?Set the isolated test database profile}"
: "${TEST_DATABASE_URL:?Set the isolated test database profile}"
ledgerone_repo_root="$(git rev-parse --show-toplevel)"
cd "$ledgerone_repo_root"
ledgerone_pw_version="$(node -p "require('@playwright/test/package.json').version")"
if [[ ! "$ledgerone_pw_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Expected a pinned Playwright release version." >&2
  exit 1
fi
ledgerone_browser_image="mcr.microsoft.com/playwright:v${ledgerone_pw_version}-noble"
ledgerone_node_root="$(dirname "$(dirname "$(node -p 'process.execPath')")")"
docker pull "$ledgerone_browser_image"
# Same Linux host network keeps PostgreSQL/app on loopback, without relaxing test
# URL validation. Same checkout path preserves Next build traces and artifacts.
# Run as the runner UID; mount only Node (read-only) and the checkout. No Docker
# socket, production environment, paid services or elevated capabilities passed.
docker run --rm --init --network host --shm-size=1g \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=${ledgerone_repo_root},dst=${ledgerone_repo_root}" \
  --mount "type=bind,src=${ledgerone_node_root},dst=/opt/ledgerone-node,readonly" \
  --workdir "$ledgerone_repo_root" \
  --env HOME=/tmp --env CI=true --env LEDGERONE_ENV=test \
  --env DATABASE_URL --env DIRECT_DATABASE_URL --env TEST_DATABASE_URL \
  --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  --env PATH=/opt/ledgerone-node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  "$ledgerone_browser_image" \
  bash -euc 'test "$(node --version)" = "v$(tr -d "[:space:]" < .nvmrc)"; node --version; npm --version; exec npm run test:e2e'
