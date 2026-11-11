import { testDatabaseURL } from "../tests/support/database";
import { spawnSync } from "node:child_process";
const url = testDatabaseURL();
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      LEDGERONE_ENV: "test",
      DATABASE_URL: url,
      DIRECT_DATABASE_URL: url,
    },
  },
);
process.exitCode = result.status ?? 1;
