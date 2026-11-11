// P1-S06A local operator check. Hosted verification needs separate approval/profile.
import pg from "pg";
import { loadProfile } from "./load-env";
import { withFreshLedgerDatabase } from "./lib/fresh-ledger-database";
import {
  readLedgerInvariants,
  assertLedgerInvariants,
} from "../src/lib/ledger/invariant-manifest";
async function main() {
  loadProfile("development");
  const target = process.env.TEST_DATABASE_URL;
  if (!target)
    throw new Error("Configure the private loopback TEST_DATABASE_URL");
  await withFreshLedgerDatabase(target, async (reference) => {
    const ref = new pg.Pool({ connectionString: reference }),
      actual = new pg.Pool({ connectionString: target });
    try {
      const baseline = await readLedgerInvariants(ref, { schema: "public" });
      assertLedgerInvariants(
        await readLedgerInvariants(actual, { schema: "public" }),
        baseline,
      );
      console.log(
        "PASS: actual local test schema invariant catalog, enabled triggers, CHECK/function/security/grants, readiness and applied migration history match a fresh reference. No writes enabled.",
      );
    } finally {
      await ref.end();
      await actual.end();
    }
  });
}
try {
  await main();
} catch {
  console.error(
    "FAIL: local ledger invariant attestation failed or could not complete. Writes remain disabled; connection details withheld.",
  );
  process.exitCode = 1;
}
