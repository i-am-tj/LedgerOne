import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { postHarness } from "../support/post-harness";
let h: Awaited<ReturnType<typeof postHarness>>;
beforeAll(async () => {
  h = await postHarness();
}, 30000);
afterAll(async () => {
  await h?.cleanup();
});
async function nowait(sql: string, values: unknown[], blocked: boolean) {
  const c = await h.admin.connect();
  try {
    await c.query("BEGIN");
    if (blocked)
      await expect(c.query(sql, values)).rejects.toMatchObject({
        code: "55P03",
      });
    else await c.query(sql, values);
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
}
it("C-T01 SQL matrix: account, workspace and implicit audit-owner FK locks held until commit", async () => {
  const u = h.users[0]!;
  let checked = false;
  h.setProbe(async (stage) => {
    if (stage !== "audit") return;
    // Explicit strongest account lock; trigger SHARE and FK KEY SHARE reenter it.
    for (const id of [u.bank, u.expense])
      await nowait(
        "SELECT id FROM ledger_account WHERE id=$1 FOR UPDATE NOWAIT",
        [id],
        true,
      );
    await nowait(
      "SELECT id FROM workspace WHERE id=$1 FOR UPDATE NOWAIT",
      [u.workspace],
      true,
    );
    // No explicit auth_user lock in the financial runner: audit owner FK supplies
    // KEY SHARE, compatible with non-key updates but excluding key updates/delete.
    await nowait(
      "SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE NOWAIT",
      [u.id],
      false,
    );
    await nowait(
      "SELECT id FROM auth_user WHERE id=$1 FOR UPDATE NOWAIT",
      [u.id],
      true,
    );
    checked = true;
  });
  try {
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(201);
    expect(checked).toBe(true);
  } finally {
    h.setProbe(undefined);
  }
});
it("C-T01 future archival fixture follows workspace/accounts order; waiting POST rechecks archive on fresh attempt", async () => {
  const u = h.users[0]!,
    archiver = await h.admin.connect();
  const before = await h.admin.query(
    "SELECT count(*)::int AS n FROM ledger_operation",
  );
  let reached!: () => void;
  const reserved = new Promise<void>((r) => {
    reached = r;
  });
  await archiver.query("BEGIN");
  await archiver.query("SELECT id FROM workspace WHERE id=$1 FOR KEY SHARE", [
    u.workspace,
  ]);
  await archiver.query("SELECT id FROM ledger_account WHERE id=$1 FOR UPDATE", [
    u.bank,
  ]);
  await archiver.query(
    'UPDATE ledger_account SET "archivedAt"=clock_timestamp() WHERE id=$1',
    [u.bank],
  );
  h.setProbe(async (stage) => {
    if (stage === "receipt") reached();
  });
  const pending = h.api(0, randomUUID(), h.payload());
  try {
    await reserved;
    await archiver.query("COMMIT");
    const r = await pending;
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "account_unavailable" });
    expect(
      (await h.admin.query("SELECT count(*)::int AS n FROM ledger_operation"))
        .rows,
    ).toEqual(before.rows);
  } finally {
    h.setProbe(undefined);
    await archiver.query("ROLLBACK");
    archiver.release();
    await pending;
    await h.admin.query(
      'UPDATE ledger_account SET "archivedAt"=NULL WHERE id=$1',
      [u.bank],
    );
  }
});
it("C-T01 reversed account input races use compatible locks and preserve POST result", async () => {
  const p = h.payload(),
    before = (
      await h.admin.query("SELECT count(*)::int AS n FROM ledger_operation")
    ).rows[0].n;
  const results = await Promise.all([
    h.api(0, randomUUID(), p),
    h.api(0, randomUUID(), { ...p, legs: [...p.legs].reverse() }),
  ]);
  expect(results.map((r) => r.status)).toEqual([201, 201]);
  expect(
    (await h.admin.query("SELECT count(*)::int AS n FROM ledger_operation"))
      .rows[0].n,
  ).toBe(before + 2);
});
