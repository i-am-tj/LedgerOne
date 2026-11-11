import "dotenv/config";
import { spawnSync } from "node:child_process";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Set TEST_DATABASE_URL to a dedicated *_test database.");
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } },
);
process.exitCode = result.status ?? 1;
