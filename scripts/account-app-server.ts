// Explicit disposable local typed-account application fixture. No hosted targets.
import pg from "pg";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { captureLedgerInvariants } from "../src/lib/ledger/invariant-manifest";
import { databaseSettings } from "../src/lib/profile";

async function main() {
  if (process.env.LEDGERONE_ENV !== "test")
    throw Error("Local test profile required");
  const source = process.env.TEST_DATABASE_URL!;
  databaseSettings({ LEDGERONE_ENV: "test", DATABASE_URL: source });
  const url = new URL(source);
  if (
    !/^\/ledgerone_controls_[a-f0-9]{16}_test$/.test(url.pathname) ||
    url.searchParams.get("schema") !== "public"
  )
    throw Error("Generated public disposable fixture required");
  const admin = new pg.Client({ connectionString: source });
  await admin.connect();
  const role = "account_writer_" + randomBytes(6).toString("hex"),
    password = randomBytes(24).toString("hex");
  const dir = mkdtempSync(join(tmpdir(), "ledgerone-account-capability-"));
  try {
    await admin.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await admin.query(`GRANT USAGE ON SCHEMA public TO "${role}";
   GRANT SELECT ON workspace,ledger_account,ledger_operation,journal,posting,audit_event,currency,opening_balance,fx_rate,account_command,account_event,transaction_record TO "${role}";
   GRANT INSERT ON ledger_account,ledger_operation,journal,posting,opening_balance,audit_event,account_command,account_event,transaction_record TO "${role}";
   GRANT UPDATE(id) ON workspace TO "${role}";
   GRANT UPDATE(id,name,"archivedAt","updatedAt") ON ledger_account TO "${role}";
   GRANT UPDATE(status,"postedAt","operationId",revision) ON journal TO "${role}"`);
    const expected = await captureLedgerInvariants(admin, {
      schema: "public",
      roles: { [role]: "RUNTIME" },
    });
    const writer = new URL(source);
    writer.username = role;
    writer.password = password;
    const file = join(dir, "capability.json");
    writeFileSync(
      file,
      JSON.stringify({
        runtimeURL: writer.toString(),
        verifierURL: source,
        expected,
      }),
      { mode: 0o600 },
    );
    const child = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        process.argv.includes("--dev") ? "dev" : "start",
        "--port",
        process.env.PORT ?? "3100",
        "--hostname",
        "127.0.0.1",
      ],
      {
        stdio: "inherit",
        env: { ...process.env, LEDGERONE_ACCOUNT_CAPABILITY_FILE: file },
      },
    );
    const stop = () => child.kill("SIGTERM");
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    const code = await new Promise<number | null>((r) => child.on("exit", r));
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    process.exitCode = code ?? 0;
  } finally {
    // Drop never forces active sessions. The generated database is owned by the
    // outer fixture and its cleanup refuses active connections.
    try {
      await admin.query(`DROP OWNED BY "${role}"`);
      await admin.query(`DROP ROLE "${role}"`);
    } finally {
      await admin.end();
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
main().catch(() => {
  console.error("Local account application setup failed");
  process.exitCode = 1;
});
