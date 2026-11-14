import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postHarness } from "../support/post-harness";
import {
  parseAccountCommand,
  type AccountCommand,
} from "../../src/lib/accounts/contract";
import { readAccountBalance } from "../../src/lib/ledger/queries";
import { getOwnerSession } from "../../src/lib/auth/requests";
describe.each(["public", "ledgerone"] as const)(
  "S07 %s typed account transactions",
  (schema) => {
    let h: Awaited<ReturnType<typeof postHarness>>;
    beforeAll(async () => {
      h = await postHarness({ schema, accounts: true });
    }, 30000);
    afterAll(async () => {
      await h?.cleanup();
    });
    const command = (body: AccountCommand, key = randomUUID(), user = 0) =>
      h.executor!.execute(
        async () => {
          const session = await getOwnerSession(
            h.runtime.auth,
            h.runtime.config,
            new Headers({ cookie: h.cookie(user) }),
          );
          if (!session) throw Error("Fixture session unavailable");
          return { ownerId: session.user.id, requestId: randomUUID() };
        },
        h.users[0]!.workspace,
        key,
        parseAccountCommand(body),
      );
    const create = (
      opening = "50000",
      accountKind: "BANK" | "CREDIT_CARD" = "BANK",
    ): Extract<AccountCommand, { kind: "CREATE_ACCOUNT" }> => ({
      kind: "CREATE_ACCOUNT",
      name: "SBI Savings",
      accountKind,
      opening,
      effectiveAt: "2026-01-01T00:00:00Z",
    });
    it.each(["50000", "-12.34", "0"])(
      "S07 create/open %s, immutable replay and exact reconciliation",
      async (amount) => {
        const key = randomUUID(),
          body = create(amount);
        const first = await command(body, key),
          id = first.result.accountId;
        expect(first.replayed).toBe(false);
        const actor = { ownerId: h.users[0]!.id, requestId: randomUUID() };
        const balance = await readAccountBalance(
          h.database,
          actor,
          id,
          new Date("2026-01-01T00:00:00Z"),
          schema,
        );
        expect(balance.balanceMinor).toBe(
          amount === "50000" ? "5000000" : amount === "-12.34" ? "-1234" : "0",
        );
        const count = (
          await h.admin.query(
            'SELECT count(*)::int n FROM opening_balance WHERE "accountId"=$1',
            [id],
          )
        ).rows[0].n;
        expect(count).toBe(amount === "0" ? 0 : 1);
        const renamed = await command({
          kind: "RENAME_ACCOUNT",
          accountId: id,
          name: "Renamed savings",
        });
        expect(renamed.result.previousName).toBe("SBI Savings");
        await command({ kind: "ARCHIVE_ACCOUNT", accountId: id });
        expect((await command(body, key)).result).toEqual(first.result);
        await expect(
          command({ ...body, name: "Changed" }, key),
        ).rejects.toMatchObject({ code: "idempotency_conflict" });
        await command({ kind: "RESTORE_ACCOUNT", accountId: id });
        if (amount === "50000") {
          const check = await command({
            kind: "RECONCILE_ACCOUNT",
            accountId: id,
            statement: "49500",
            effectiveAt: "2026-01-02T00:00:00Z",
          });
          expect(check.result.differenceMinor).toBe("50000");
        }
        const before = await h.database.accountCommand.count();
        await expect(
          command(
            { kind: "RENAME_ACCOUNT", accountId: id, name: "Attack" },
            randomUUID(),
            1,
          ),
        ).rejects.toMatchObject({ code: "not_found" });
        expect(await h.database.accountCommand.count()).toBe(before);
      },
    );
    it("S07 credit-normal debt opening and concurrent same-key create commit once", async () => {
      const key = randomUUID(),
        body = create("123.45", "CREDIT_CARD");
      const responses = await Promise.all([
        command(body, key),
        command(body, key),
      ]);
      expect(responses[0].result).toEqual(responses[1].result);
      expect(responses.filter((r) => !r.replayed)).toHaveLength(1);
      const result = await readAccountBalance(
        h.database,
        { ownerId: h.users[0]!.id, requestId: randomUUID() },
        responses[0].result.accountId,
        new Date("2026-01-02T00:00:00Z"),
        schema,
      );
      expect(result.balanceMinor).toBe("12345");
    });
    it("S07 injected opening failure leaves no account/receipt/marker/audit", async () => {
      const before = await h.database.account.count();
      h.setProbe(async (stage) => {
        if (stage === "sealed") throw Error("injected opening fault");
      });
      try {
        await expect(command(create())).rejects.toMatchObject({
          code: "service_unavailable",
        });
      } finally {
        h.setProbe(undefined);
      }
      expect(await h.database.account.count()).toBe(before);
    });

    it("S07 account receipts require matching immutable audit under the actual role", async () => {
      const created = await command(create("0")),
        id = created.result.accountId,
        u = h.users[0]!;
      const before = await h.database.accountCommand.count();
      const c = await h.admin.connect();
      try {
        await c.query("BEGIN");
        await c.query(`SET LOCAL ROLE "${h.role}"`);
        await c.query(
          'INSERT INTO account_command(id,"workspaceId","ownerId","accountId","idempotencyKey","requestHash",result) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',
          [
            randomUUID(),
            u.workspace,
            u.id,
            id,
            randomUUID(),
            "a".repeat(64),
            JSON.stringify(created.result),
          ],
        );
        await expect(c.query("COMMIT")).rejects.toMatchObject({
          code: "23514",
        });
        await c.query("ROLLBACK");
        await c.query("BEGIN");
        await c.query(`SET LOCAL ROLE "${h.role}"`);
        await expect(
          c.query(
            "UPDATE account_event SET data='{}'::jsonb WHERE \"accountId\"=$1",
            [id],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await c.query("ROLLBACK");
      } finally {
        c.release();
      }
      expect(await h.database.accountCommand.count()).toBe(before);
      await expect(
        h.admin.query('DELETE FROM account_event WHERE "accountId"=$1', [id]),
      ).rejects.toMatchObject({ code: "23514" });
    });
    it("S07 snapshots the prior name of an account created before lifecycle history", async () => {
      const id = h.users[0]!.bank;
      expect(
        await h.database.accountEvent.count({ where: { accountId: id } }),
      ).toBe(0);
      const renamed = await command({
        kind: "RENAME_ACCOUNT",
        accountId: id,
        name: "Legacy renamed",
      });
      expect(renamed.result.previousName).toBe("Fixture");
      expect(renamed.result.name).toBe("Legacy renamed");
    });
  },
);
