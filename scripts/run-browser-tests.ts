// Browser tests always share one generated disposable database with the actual
// Next server. This preserves the local writer's generated-target restriction.
import { spawnSync } from "node:child_process";
import { loadProfile } from "./load-env";
import { withFreshLedgerDatabase } from "./lib/fresh-ledger-database";
loadProfile("test");
withFreshLedgerDatabase(process.env.TEST_DATABASE_URL!, async (url) => {
  const result = spawnSync(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        LEDGERONE_ENV: "test",
        DATABASE_URL: url,
        DIRECT_DATABASE_URL: url,
        TEST_DATABASE_URL: url,
      },
    },
  );
  if (result.status !== 0) throw Error("Browser regressions failed");
}).catch(() => {
  console.error("Disposable browser verification failed");
  process.exitCode = 1;
});
