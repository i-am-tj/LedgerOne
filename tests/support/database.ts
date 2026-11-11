import { loadProfile } from "../../scripts/load-env";
import { databaseSettings } from "../../src/lib/profile";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
loadProfile("test");
export function testDatabaseURL(): string {
  const url = process.env.TEST_DATABASE_URL;
  databaseSettings({
    ...process.env,
    LEDGERONE_ENV: "test",
    DATABASE_URL: url,
  });
  return url!;
}
export function testDatabase() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: testDatabaseURL(),
      connectionTimeoutMillis: 3000,
    }),
  });
}
