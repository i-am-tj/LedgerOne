export type Profile = "development" | "production" | "test";
type Environment = Readonly<Record<string, string | undefined>>;
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function readProfile(env: Environment): Profile {
  const value = env.LEDGERONE_ENV ?? env.NODE_ENV ?? "production";
  if (!["development", "production", "test"].includes(value))
    throw new Error("Invalid LedgerOne environment profile.");
  return value as Profile;
}

// Pure validation: never include connection strings or credentials in errors.
export function databaseSettings(env: Environment, migration = false) {
  const profile = readProfile(env);
  const value = migration ? env.DIRECT_DATABASE_URL : env.DATABASE_URL;
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error("Database configuration missing or invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash)
    throw new Error("Invalid PostgreSQL configuration.");
  const schema = url.searchParams.get("schema") ?? "public";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema))
    throw new Error("Invalid database schema.");
  if (profile !== "production") {
    if (!loopback.has(url.hostname))
      throw new Error("Local and test profiles require a loopback database.");
    if (profile === "test" && !/^\/[a-z0-9_]+_test$/.test(url.pathname))
      throw new Error("Tests require a dedicated *_test database.");
  } else {
    const ref = env.SUPABASE_PROJECT_REF ?? "";
    const user = decodeURIComponent(url.username);
    const role = migration ? "ledgerone_migrator" : "ledgerone_app";
    const direct = url.hostname === `db.${ref}.supabase.co`;
    const pooled = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
    if (
      !/^[a-z]{20}$/.test(ref) ||
      !(direct || pooled) ||
      user !== (pooled ? `${role}.${ref}` : role) ||
      !url.password ||
      url.pathname !== "/postgres" ||
      schema !== "ledgerone" ||
      url.searchParams.get("sslmode") !== "verify-full" ||
      (migration && url.port === "6543") ||
      (direct && !["", "5432"].includes(url.port)) ||
      !["", "5432", ...(migration ? [] : ["6543"])].includes(url.port)
    )
      throw new Error(
        "Production requires the configured Supabase project, private schema, verified TLS and separate roles.",
      );
    if (
      env.ALLOW_DEMO_SEED === "true" ||
      env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
    )
      throw new Error("Unsafe production environment configuration.");
  }
  // pg connection-string SSL fields override explicit TLS config. Accept only
  // the validated mode, then supply verified TLS explicitly in the adapter.
  if (
    [...url.searchParams.keys()].some(
      (key) => !["schema", "sslmode"].includes(key),
    )
  )
    throw new Error("Unsupported database connection parameters.");
  url.searchParams.delete("schema");
  url.searchParams.delete("sslmode");
  return {
    profile,
    schema,
    connectionString: url.toString(),
    tls: profile === "production",
  };
}

// Prisma Migrate's schema engine uses require + strict, whereas pg runtime
// receives an explicit verified TLS object. Do not let require imply trust-all.
export function prismaMigrationURL(env: Environment): string {
  const settings = databaseSettings(env, true);
  const url = new URL(env.DIRECT_DATABASE_URL!);
  if (settings.tls) {
    url.searchParams.set("sslmode", "require");
    url.searchParams.set("sslaccept", "strict");
    if (env.SUPABASE_DB_CA_FILE)
      url.searchParams.set("sslrootcert", env.SUPABASE_DB_CA_FILE);
  }
  return url.toString();
}
