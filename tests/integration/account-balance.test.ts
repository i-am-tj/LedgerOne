import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readAccountBalance } from "../../src/lib/ledger/queries";
import { postHarness } from "../support/post-harness";

describe.each(["public", "ledgerone"] as const)(
  "S07 %s balance reads",
  (schema) => {
    let h: Awaited<ReturnType<typeof postHarness>>;
    beforeAll(async () => {
      h = await postHarness({ schema });
    }, 30000);
    afterAll(async () => {
      await h?.cleanup();
    });

    it("S07 exact account balances use posted effective dates and reject foreign ownership", async () => {
      const actor = { ownerId: h.users[0]!.id, requestId: randomUUID() };
      const id = h.users[0]!.bank;
      const at = new Date("2026-02-01T00:00:00Z");
      expect(
        (await readAccountBalance(h.database, actor, id, at, schema))
          .balanceMinor,
      ).toBe("0");
      const command = {
        ...h.payload(),
        effectiveAt: at.toISOString(),
        legs: h
          .payload()
          .legs.map((l) => ({ ...l, amount: "9999999999999999.99" })),
      };
      for (let n = 0; n < 2; n++)
        expect((await h.api(0, randomUUID(), command)).status).toBe(201);
      expect(
        (
          await readAccountBalance(
            h.database,
            actor,
            id,
            new Date(at.getTime() - 1),
            schema,
          )
        ).balanceMinor,
      ).toBe("0");
      expect(
        (await readAccountBalance(h.database, actor, id, at, schema))
          .balanceMinor,
      ).toBe("-1999999999999999998");
      await expect(
        readAccountBalance(
          h.database,
          { ...actor, ownerId: h.users[1]!.id },
          id,
          at,
          schema,
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        readAccountBalance(h.database, actor, id, new Date("invalid"), schema),
      ).rejects.toMatchObject({ status: 400 });
      await h.admin.query(
        'UPDATE ledger_account SET "archivedAt"=now() WHERE id=$1',
        [id],
      );
      expect(
        (await readAccountBalance(h.database, actor, id, at, schema))
          .balanceMinor,
      ).toBe("-1999999999999999998");
    });

    it("S07 liabilities display credit-normal balances without combining currencies", async () => {
      const actor = { ownerId: h.users[0]!.id, requestId: randomUUID() };
      const card = h.users[0]!.card;
      const command = {
        ...h.payload(),
        effectiveAt: "2026-03-01T00:00:00Z",
        legs: h.payload().legs.map((l) => ({
          ...l,
          accountId: l.accountId === h.users[0]!.bank ? card : l.accountId,
          amount: "12.34",
        })),
      };
      expect((await h.api(0, randomUUID(), command)).status).toBe(201);
      const result = await readAccountBalance(
        h.database,
        actor,
        card,
        new Date("2026-03-01T00:00:00Z"),
        schema,
      );
      expect(result.balanceMinor).toBe("1234");
      expect(result.currency).toBe("INR");
    });
  },
);
