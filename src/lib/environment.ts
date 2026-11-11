import { databaseSettings, readProfile } from "./profile";
export function assertDemoSeedAllowed(
  env: Readonly<Record<string, string | undefined>>,
): void {
  if (
    readProfile(env) !== "development" ||
    env.NODE_ENV !== "development" ||
    env.ALLOW_DEMO_SEED !== "true"
  ) {
    throw new Error("Demo seed requires development mode and explicit opt-in.");
  }
  databaseSettings(env);
}
