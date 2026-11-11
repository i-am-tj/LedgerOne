import { loadProfile } from "../scripts/load-env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertDemoSeedAllowed } from "../src/lib/environment";
loadProfile(
  process.env.LEDGERONE_ENV === "production" ? "production" : "development",
);
assertDemoSeedAllowed(process.env);
const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  await database.appMetadata.upsert({
    where: { key: "development_fixture" },
    create: { key: "development_fixture", value: "P1-S01 development fixture" },
    update: { value: "P1-S01 development fixture" },
  });
  console.log(
    "Development platform fixture ready. No financial demo data exists yet.",
  );
} finally {
  await database.$disconnect();
}
