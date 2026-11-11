import { testDatabase } from "../support/database";
import { SCHEMA_VERSION } from "../../src/lib/schema-version";
import { afterAll, expect, it } from "vitest";
const database = testDatabase();
afterAll(async () => {
  await database.$disconnect();
});
it("P1-S01 fresh migration exposes the expected schema version", async () => {
  expect(
    await database.appMetadata.findUnique({ where: { key: "schema_version" } }),
  ).toEqual({ key: "schema_version", value: SCHEMA_VERSION });
});
