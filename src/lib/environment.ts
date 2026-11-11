export function assertDemoSeedAllowed(
  env: Readonly<Record<string, string | undefined>>,
): void {
  if (env.NODE_ENV !== "development" || env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seed requires development mode and explicit opt-in.");
  }
  const url = new URL(env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Demo seed is restricted to a loopback database.");
  }
}
