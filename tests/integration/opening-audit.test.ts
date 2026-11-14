import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { postHarness } from "../support/post-harness";

let h: Awaited<ReturnType<typeof postHarness>>;
beforeAll(async () => {
  h = await postHarness({ schema: "ledgerone", upgrade: true });
  await h.admin.query(
    `GRANT INSERT ON ledgerone.opening_balance TO "${h.role}"`,
  );
}, 30000);
afterAll(async () => {
  await h?.cleanup();
});
it.each([
  "valid",
  "missing",
  "wrong-action",
  "wrong-target",
  "wrong-owner",
  "wrong-actor",
  "blank",
  "duplicate",
  "missing-marker",
] as const)(
  "S07 restricted-role new opening audit %s is atomic",
  async (mode) => {
    const u = h.users[0]!,
      account = randomUUID(),
      equity = randomUUID(),
      op = randomUUID(),
      journal = randomUUID();
    await h.admin.query(
      `INSERT INTO ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt")
 VALUES($1,$3,$4,'Opening target','ASSET','BANK','INR',now()),($2,$3,$4,'Opening equity','EQUITY','OPENING_EQUITY','INR',now())`,
      [account, equity, u.workspace, u.id],
    );
    const c = await h.admin.connect();
    const priorTarget =
      mode === "wrong-target"
        ? (
            await h.admin.query(
              'SELECT id FROM journal WHERE "ownerId"=$1 AND "workspaceId"=$2 ORDER BY id LIMIT 1',
              [u.id, u.workspace],
            )
          ).rows[0].id
        : journal;
    let phase = "constructing";
    let error: unknown;
    try {
      await c.query("BEGIN");
      await c.query(`SET LOCAL ROLE "${h.role}"`);
      await c.query(
        'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,\'OPENING\')',
        [op, u.workspace, u.id, randomUUID(), "a".repeat(64)],
      );
      await c.query(
        'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",kind) VALUES($1,$2,$3,$4,\'OPENING\')',
        [journal, u.workspace, u.id, "2026-01-01T00:00:00Z"],
      );
      for (const [id, side] of [
        [account, "DEBIT"],
        [equity, "CREDIT"],
      ])
        await c.query(
          'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,5000000,5000000)',
          [randomUUID(), journal, u.workspace, u.id, id, side],
        );
      if (mode !== "missing-marker")
        await c.query(
          'INSERT INTO opening_balance(id,"workspaceId","ownerId","accountId","journalId",source) VALUES($1,$2,$3,$4,$5,\'User-entered opening balance\')',
          [randomUUID(), u.workspace, u.id, account, journal],
        );
      await c.query(
        'UPDATE journal SET status=\'POSTED\',"postedAt"=now(),"operationId"=$1 WHERE id=$2',
        [op, journal],
      );
      if (mode !== "missing") {
        const insert = () =>
          c.query(
            'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [
              randomUUID(),
              u.workspace,
              mode === "wrong-owner" ? h.users[1]!.id : u.id,
              mode === "wrong-actor" ? h.users[1]!.id : u.id,
              randomUUID(),
              mode === "wrong-action" ? "ledger.corrected" : "ledger.opened",
              op,
              mode === "wrong-target" ? priorTarget : journal,
              mode === "blank" ? " " : "Opening balance",
            ],
          );
        await insert();
        if (mode === "duplicate") await insert();
      }
      phase = "commit";
      await c.query("COMMIT");
    } catch (e) {
      error = e;
      await c.query("ROLLBACK");
    } finally {
      c.release();
    }
    if (mode === "valid") expect(error).toBeUndefined();
    else expect(error).toBeDefined();
    if (
      ["missing", "wrong-action", "wrong-target", "missing-marker"].includes(
        mode,
      )
    ) {
      expect(phase).toBe("commit");
      expect(error).toMatchObject({ code: "23514" });
    }
    const rows = (
      await h.admin.query(
        'SELECT (SELECT count(*)::int FROM journal WHERE id=$1) journals,(SELECT count(*)::int FROM ledger_operation WHERE id=$2) receipts,(SELECT count(*)::int FROM audit_event WHERE "operationId"=$2) audits,(SELECT count(*)::int FROM posting WHERE "journalId"=$1) postings,(SELECT count(*)::int FROM opening_balance WHERE "journalId"=$1) markers',
        [journal, op],
      )
    ).rows[0];
    expect(rows).toEqual(
      mode === "valid"
        ? { journals: 1, receipts: 1, audits: 1, postings: 2, markers: 1 }
        : { journals: 0, receipts: 0, audits: 0, postings: 0, markers: 0 },
    );
  },
);
