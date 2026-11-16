# Reproduce the Phase 1 local accounting gate

This procedure verifies local software behavior, not hosted readiness or release authorization. Read [the gate verdict and remaining prerequisites](../gates/PHASE_1.md) separately. All output uses synthetic fixtures; never supply hosted credentials.

1. Check out the desired committed source and confirm `git status --porcelain` is empty. Use the repository .nvmrc Node22 runtime, npm10, Python3 and PostgreSQL17.6. Install dependencies with `npm ci` to obtain tsx, and install Chromium using the existing `npx playwright install chromium` (on Linux the existing scripts/test-e2e-ci.sh handles bundled system dependencies). These prerequisites must succeed; no fallback browser/test skip is supported.
2. Start an isolated local PostgreSQL17.6 instance. The existing Docker Compose/setup may supply it, or use an existing approved native loopback instance. Create a dedicated `ledgerone_test` control database and local role capable of creating/dropping generated disposable databases and temporary roles. Do not point at a persistent finance database. Do not stop a shared database for this runner. Store the local-only TEST_DATABASE_URL privately; do not commit it or paste secrets into reports. No Google token or real sign-in is required for synthetic sessions.
3. From a clean committed checkout run:

```sh
LEDGERONE_ENV=test TEST_DATABASE_URL='<loopback PostgreSQL URL ending in /ledgerone_test?schema=public>' \
  npm run verify:phase1 -- /private/tmp/ledgerone-phase1-evidence-unique
```

The output path must be new and absolute. Test profile validation rejects non-loopback/non-test targets before database access; no production .env is read. The existing test profile may read .env.development.local, but explicitly supplied test URLs are retained. Fresh generated public/private fixtures are created by the existing factory; only those generated resources are eligible for cleanup. No FORCE cleanup/active-session termination occurs. Leave unrelated local services alone.

The runner requires clean committed source and records the SHA, Node/npm/OS/PostgreSQL settings,001–012 SHA256 digests, every exact command/exit code and sanitized per-stage output. It runs mandatory npm ci, generate, test migration, format, lint, typecheck, all unit/property tests, all integration/concurrency tests, private fresh/upgrade/schema/role checks, invariant attestation, production build, all desktop/mobile browser tests and foundation checks. It has no stage filtering or skip flag. On the first failed stage it stops with a nonzero exit and a FAIL manifest; cleanup errors also fail. Outputs remain outside the checkout and are private by default. Inspect/redact before publication. A killed process may leave a RUNNING/incomplete manifest; that is NOT RUN/FAIL evidence, never PASS.

The resulting PASS means every listed executable local stage exited0 and disposable cleanup completed. It does not invent missing hosted/backup/restore/security/owner review evidence. Production application writes, deployment, raw consumer posting and Phase2 remain separately gated. Existing CI uses the same mandatory stages; both push and PR exact-head runs are recorded on the draft PR without assuming local output proves CI.

## Failure handling

Retain the original output and manifest. Do not change financial expectations, deadlines or permissions to get green. Investigate affected tests in isolated fixtures before considering bounded reruns; record every attempt. In particular #34 retains shared-Docker failures and the S08-D immediate-backend CI failure plus successful unchanged-source rerun; their cause is not established. A deterministic integrity/security/connection-safety defect blocks the affected scope. No repeat capacity campaign is part of S09.
