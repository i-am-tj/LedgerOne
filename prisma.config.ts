import { loadProfile } from "./scripts/load-env";
import { defineConfig } from "prisma/config";
import { prismaMigrationURL } from "./src/lib/profile";
loadProfile(
  process.env.LEDGERONE_ENV === "production"
    ? "production"
    : process.env.LEDGERONE_ENV === "test"
      ? "test"
      : "development",
);
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: {
    url:
      (process.env.DIRECT_DATABASE_URL
        ? prismaMigrationURL(process.env)
        : undefined) ||
      "postgresql://unconfigured:unconfigured@127.0.0.1:5432/unconfigured",
  },
});
