import { describe, it, expect } from "vitest";
import { databaseSettings, prismaMigrationURL } from "./profile";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProfile } from "../../scripts/load-env";

const ref = "abcdefghijklmnopqrst";
const production = {
  LEDGERONE_ENV: "production",
  SUPABASE_PROJECT_REF: ref,
  DATABASE_URL: `postgresql://ledgerone_app.${ref}:test-only@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?schema=ledgerone&sslmode=verify-full`,
  DIRECT_DATABASE_URL: `postgresql://ledgerone_migrator.${ref}:test-only@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?schema=ledgerone&sslmode=verify-full`,
};
describe("P1-S04A environment isolation", () => {
  it("never falls through to production .env in development/test tooling", () => {
    const directory = mkdtempSync(join(tmpdir(), "ledgerone-profile-"));
    const priorProfile = process.env.LEDGERONE_ENV;
    const priorCanary = process.env.LEDGERONE_PROFILE_CANARY;
    delete process.env.LEDGERONE_PROFILE_CANARY;
    try {
      writeFileSync(
        join(directory, ".env"),
        "LEDGERONE_PROFILE_CANARY=production-only\n",
      );
      writeFileSync(
        join(directory, ".env.development.local"),
        "# deliberately missing canary\n",
      );
      for (const profile of ["development", "test"] as const) {
        loadProfile(profile, directory);
        expect(process.env.LEDGERONE_PROFILE_CANARY).toBeUndefined();
      }
      loadProfile("production", directory);
      expect(process.env.LEDGERONE_PROFILE_CANARY).toBe("production-only");
    } finally {
      if (priorProfile === undefined) delete process.env.LEDGERONE_ENV;
      else process.env.LEDGERONE_ENV = priorProfile;
      if (priorCanary === undefined)
        delete process.env.LEDGERONE_PROFILE_CANARY;
      else process.env.LEDGERONE_PROFILE_CANARY = priorCanary;
      rmSync(directory, { recursive: true });
    }
  });
  it("requires strict certificate validation for Prisma Migrate without transaction pooling", () => {
    const url = new URL(
      prismaMigrationURL({
        ...production,
        SUPABASE_DB_CA_FILE: "/private/cert/root.crt",
      }),
    );
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("sslaccept")).toBe("strict");
    expect(url.searchParams.get("sslrootcert")).toBe("/private/cert/root.crt");
    expect(url.searchParams.get("schema")).toBe("ledgerone");
    expect(url.port).toBe("5432");
  });
  it("accepts configured production runtime/migration roles and strips TLS URL overrides", () => {
    expect(databaseSettings(production)).toMatchObject({
      schema: "ledgerone",
      tls: true,
    });
    expect(databaseSettings(production).connectionString).not.toContain(
      "sslmode",
    );
    expect(databaseSettings(production, true).tls).toBe(true);
  });
  it.each(["development", "test"])(
    "refuses hosted databases from %s",
    (LEDGERONE_ENV) => {
      expect(() => databaseSettings({ ...production, LEDGERONE_ENV })).toThrow(
        /loopback/,
      );
    },
  );
  it("allows only isolated local test DB names", () => {
    for (const name of ["ledgerone", "postgres", "ledgerone_test_backup", ""])
      expect(() =>
        databaseSettings({
          LEDGERONE_ENV: "test",
          DATABASE_URL: `postgresql://test:test@127.0.0.1/${name}`,
        }),
      ).toThrow();
    expect(
      databaseSettings({
        LEDGERONE_ENV: "test",
        DATABASE_URL: "postgresql://test:test@127.0.0.1/ledgerone_test",
      }).tls,
    ).toBe(false);
  });
  it.each([
    { DATABASE_URL: "postgresql://dev:dev@127.0.0.1/ledgerone" },
    { SUPABASE_PROJECT_REF: "wrong-project" },
    {
      DATABASE_URL: production.DATABASE_URL.replace(
        "ledgerone_app.",
        "postgres.",
      ),
    },
    {
      DATABASE_URL: production.DATABASE_URL.replace(
        "schema=ledgerone",
        "schema=public",
      ),
    },
    { DATABASE_URL: production.DATABASE_URL.replace("verify-full", "require") },
    { DATABASE_URL: production.DATABASE_URL + "&sslrootcert=untrusted" },
    {
      DATABASE_URL: production.DATABASE_URL.replace(
        ".pooler.supabase.com",
        ".pooler.supabase.com.evil.test",
      ),
    },
    { ALLOW_DEMO_SEED: "true" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { LEDGERONE_ENV: "unknown" },
    { DATABASE_URL: "" },
  ])(
    "rejects unsafe production configuration without leaking credentials: %j",
    (override) => {
      expect(() => databaseSettings({ ...production, ...override })).toThrow();
      try {
        databaseSettings({ ...production, ...override });
      } catch (error) {
        expect(String(error)).not.toContain("test-only");
        expect(String(error)).not.toContain("postgresql://");
      }
    },
  );
  it("never uses the transaction pooler or runtime credential for migrations", () => {
    expect(() =>
      databaseSettings(
        { ...production, DIRECT_DATABASE_URL: production.DATABASE_URL },
        true,
      ),
    ).toThrow();
    expect(() =>
      databaseSettings(
        {
          ...production,
          DIRECT_DATABASE_URL: production.DIRECT_DATABASE_URL.replace(
            ":5432/",
            ":6543/",
          ),
        },
        true,
      ),
    ).toThrow();
  });
});
