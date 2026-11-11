// P1-S06A: local disposable reference only. Never accepts a hosted database.
import pg from "pg";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { databaseSettings } from "../../src/lib/profile";
export async function createFreshLedgerDatabase(source: string) {
  databaseSettings({ LEDGERONE_ENV: "test", DATABASE_URL: source });
  const input = new URL(source);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(input.hostname) ||
    !input.pathname.endsWith("_test") ||
    (input.searchParams.get("schema") &&
      input.searchParams.get("schema") !== "public")
  )
    throw new Error(
      "A loopback public-schema *_test reference source is required",
    );
  const name = `ledgerone_controls_${randomBytes(8).toString("hex")}_test`;
  const admin = new pg.Client({ connectionString: source });
  await admin.connect();
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const target = new URL(input);
    target.pathname = `/${name}`;
    target.searchParams.set("schema", "public");
    const result = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          LEDGERONE_ENV: "test",
          DATABASE_URL: target.toString(),
          DIRECT_DATABASE_URL: target.toString(),
          TEST_DATABASE_URL: target.toString(),
        },
      },
    );
    if (result.status !== 0)
      throw new Error(
        "Fresh reference migration failed (output withheld to protect credentials)",
      );
    return {
      url: target.toString(),
      async cleanup() {
        await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        await admin.end();
      },
    };
  } catch (error) {
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    throw error;
  }
}

export async function withFreshLedgerDatabase<T>(
  source: string,
  work: (url: string) => Promise<T>,
) {
  const lease = await createFreshLedgerDatabase(source);
  try {
    return await work(lease.url);
  } finally {
    await lease.cleanup();
  }
}
