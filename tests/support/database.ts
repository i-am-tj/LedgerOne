import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
export function testDatabaseURL(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error(
      "Tests require TEST_DATABASE_URL pointing to a dedicated *_test database.",
    );
  return url;
}
export function testDatabase() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: testDatabaseURL(),
      connectionTimeoutMillis: 3000,
    }),
  });
}
