// S09: one local composition of the existing mandatory npm/CI stages.
// No write enablement, hosted profile, test filtering or skip-stage option.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { platform, arch, release } from "node:os";
import pg from "pg";
import { loadProfile } from "./load-env";
import { withFreshLedgerDatabase } from "./lib/fresh-ledger-database";
import { databaseSettings } from "../src/lib/profile";

async function main() {
  if (process.argv.length !== 3)
    throw Error(
      "Usage: npm run verify:phase1 -- /absolute/empty/output-directory",
    );
  const out = process.argv[2]!;
  if (!out.startsWith("/") || resolve(out) === process.cwd() || existsSync(out))
    throw Error("A new absolute output directory is required");
  if (process.env.LEDGERONE_ENV !== "test")
    throw Error(
      "Explicit LEDGERONE_ENV=test required; no production profile is read",
    );
  loadProfile("test");
  const control = process.env.TEST_DATABASE_URL;
  databaseSettings({ LEDGERONE_ENV: "test", DATABASE_URL: control });
  const source = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const dirty = spawnSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  });
  if (source.status !== 0 || dirty.status !== 0 || dirty.stdout.trim())
    throw Error(
      "Clean committed source required for exact-source gate evidence",
    );
  if (!/^v22\./.test(process.version))
    throw Error("Use the repository Node22 runtime");
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const manifest: {
    [key: string]: unknown;
    stages: { command: string; exitCode: number; log: string }[];
  } = {
    sourceCommit: source.stdout.trim(),
    dirty: false,
    startedAt: new Date().toISOString(),
    node: process.version,
    npm: spawnSync("npm", ["--version"], { encoding: "utf8" }).stdout.trim(),
    os: { platform: platform(), arch: arch(), release: release() },
    scope:
      "LOCAL ONLY; not Phase1 release approval, hosted evidence or write activation",
    status: "RUNNING",
    stages: [],
    migrations: Object.fromEntries(
      readdirSync("prisma/migrations")
        .filter((n) =>
          existsSync(join("prisma/migrations", n, "migration.sql")),
        )
        .sort()
        .map((n) => [
          n,
          createHash("sha256")
            .update(readFileSync(join("prisma/migrations", n, "migration.sql")))
            .digest("hex"),
        ]),
    ),
  };
  const save = () =>
    writeFileSync(
      join(out, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { mode: 0o600 },
    );
  save();
  async function stage(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ) {
    const name = `${String(manifest.stages.length + 1).padStart(2, "0")}-${command}-${args.join("-").replaceAll(":", "-")}.txt`;
    const chunks: string[] = [];
    let pending = "";
    const redact = (s: string) =>
      s.replace(
        /postgres(?:ql)?:\/\/[^\s"']+/g,
        "<redacted-local-database-url>",
      );
    console.log(`Running ${command} ${args.join(" ")}`);
    const exitCode = await new Promise<number>((done) => {
      const child = spawn(command, args, {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const collect = (chunk: Buffer) => {
        pending += chunk.toString();
        const lines = pending.split("\n");
        pending = lines.pop()!;
        for (const line of lines) chunks.push(redact(line) + "\n");
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.on("error", (error) => {
        chunks.push(redact(error.message));
        done(127);
      });
      child.on("close", (code) => done(code ?? 1));
    });
    chunks.push(redact(pending));
    writeFileSync(join(out, name), chunks.join(""), { mode: 0o600 });
    manifest.stages.push({
      command: [command, ...args].join(" "),
      exitCode,
      log: name,
    });
    save();
    if (exitCode !== 0)
      throw Error(
        `Gate stopped: ${command} ${args.join(" ")} exit${exitCode}; see ${name}`,
      );
  }
  try {
    const env = { ...process.env, LEDGERONE_ENV: "test" };
    // npm ci is deliberately mandatory: clean-checkout dependency installation is evidence.
    await stage("npm", ["ci"], env);
    await withFreshLedgerDatabase(control!, async (url) => {
      const scoped = {
        ...env,
        DATABASE_URL: url,
        DIRECT_DATABASE_URL: url,
        TEST_DATABASE_URL: url,
      };
      const db = new pg.Client({ connectionString: url });
      await db.connect();
      try {
        manifest.database = {
          ...(
            await db.query(
              "SELECT version(),current_setting('server_version') server_version,current_setting('TimeZone') timezone,current_setting('default_transaction_isolation') default_isolation",
            )
          ).rows[0],
          profile:
            "generated disposable loopback PostgreSQL; public and ledgerone restricted-role fixtures; no hosted target",
          financialIsolation:
            "SERIALIZABLE in existing command executor (server default recorded separately)",
        };
        save();
      } finally {
        await db.end();
      }
      for (const task of [
        "db:generate",
        "db:migrate:test",
        "format:check",
        "lint",
        "typecheck",
        "test:unit",
        "test:integration",
        "test:schema",
        "ledger:attest",
        "build",
        "test:e2e",
      ])
        await stage("npm", ["run", task], scoped);
      await stage("python3", ["scripts/check_foundation.py"], scoped);
    });
    manifest.status = "PASS";
  } catch (error) {
    manifest.status = "FAIL";
    manifest.error =
      error instanceof Error ? error.message : "Gate execution failed";
    process.exitCode = 1;
  } finally {
    manifest.finishedAt = new Date().toISOString();
    save();
  }
  console.log(
    `Local execution ${manifest.status}; manifest ${join(out, "manifest.json")}. Release verdict requires docs/gates/PHASE_1.md and owner review.`,
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Gate preflight failed",
  );
  process.exitCode = 1;
});
