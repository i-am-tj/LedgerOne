import { afterEach, expect, it, vi } from "vitest";
import { getAccountExecutor } from "./capability";
afterEach(() => vi.unstubAllEnvs());
it.each(["production", "development", "preview"])(
  "S07 %s cannot activate the local typed writer",
  (profile) => {
    vi.stubEnv("LEDGERONE_ENV", profile);
    vi.stubEnv(
      "LEDGERONE_ACCOUNT_CAPABILITY_FILE",
      "/file-that-must-never-be-read",
    );
    expect(getAccountExecutor()).toBeNull();
  },
);
it("S07 test profile without explicit local provisioning has no writer", () => {
  vi.stubEnv("LEDGERONE_ENV", "test");
  vi.stubEnv("LEDGERONE_ACCOUNT_CAPABILITY_FILE", undefined);
  expect(getAccountExecutor()).toBeNull();
});
