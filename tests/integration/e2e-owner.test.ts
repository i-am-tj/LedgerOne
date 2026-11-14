import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { withFreshLedgerDatabase } from "../../scripts/lib/fresh-ledger-database";
import { testDatabaseURL } from "../support/database";
import { ensureE2EOwner } from "../support/e2e-owner";

it("S06D-R01 concurrent first-use browser fixtures create exactly one owner", async () => {
  await withFreshLedgerDatabase(testDatabaseURL(), async (url) => {
    const database = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    try {
      const email = `fixture-${randomUUID()}@ledgerone.test`;
      const results = await Promise.all(
        Array.from({ length: 24 }, () => ensureE2EOwner(database, email)),
      );
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(await database.user.count({ where: { email } })).toBe(1);
      const owner = await database.user.findUniqueOrThrow({ where: { email } });
      expect(owner.emailVerified).toBe(true);
      expect((await ensureE2EOwner(database, email)).id).toBe(owner.id);
    } finally {
      await database.$disconnect();
    }
  });
}, 30000);
