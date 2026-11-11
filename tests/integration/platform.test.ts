import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { afterAll, expect, it } from "vitest";
// Do not skip silently if PostgreSQL is absent: migration readiness is a gate.
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for integration tests");
const database = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
  }),
});
afterAll(async () => {
  await database.$disconnect();
});
it("P1-S01 fresh migration exposes the expected schema version", async () => {
  expect(
    await database.appMetadata.findUnique({ where: { key: "schema_version" } }),
  ).toEqual({ key: "schema_version", value: "3" });
});
