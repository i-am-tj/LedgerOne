import { afterAll, beforeAll, expect, it } from "vitest";
import {
  captureLedgerInvariants,
  assertLedgerInvariants,
  InvariantDriftError,
} from "../../src/lib/ledger/invariants";
import { postHarness } from "../support/post-harness";
let a: Awaited<ReturnType<typeof postHarness>>;
let b: Awaited<ReturnType<typeof postHarness>>;
beforeAll(async () => {
  a = await postHarness();
  b = await postHarness();
}, 30000);
afterAll(async () => {
  await b?.cleanup();
  await a?.cleanup();
});
it("S06D-R02 independent equivalent targets normalize column ACL role identities", () => {
  try {
    assertLedgerInvariants(a.expected, b.expected);
  } catch (error) {
    expect((error as InvariantDriftError).differences).toEqual([]);
  }
});
it("S06D-R02 additional column privilege remains detectable after role normalization", async () => {
  await b.admin.query(`GRANT UPDATE(description) ON journal TO "${b.role}"`);
  const c = await b.admin.connect();
  try {
    const altered = await captureLedgerInvariants(c, {
      schema: "public",
      roles: { [b.role]: "RUNTIME" },
    });
    expect(() => assertLedgerInvariants(altered, b.expected)).toThrow(
      InvariantDriftError,
    );
  } finally {
    c.release();
    await b.admin.query(
      `REVOKE UPDATE(description) ON journal FROM "${b.role}"`,
    );
  }
});
