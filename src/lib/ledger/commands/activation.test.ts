import { afterEach, expect, it, vi } from "vitest";
const pool = vi.hoisted(() =>
  vi.fn(function () {
    throw new Error("Unexpected database constructor");
  }),
);
vi.mock("pg", () => ({ default: { Pool: pool } }));
import { PostExecutor } from "./executor";
const local =
  "postgresql://fixture:fixture@127.0.0.1:5432/ledgerone_controls_0123456789abcdef_test?schema=public";
afterEach(() => {
  vi.unstubAllEnvs();
  pool.mockClear();
});
it.each(["production", "development", undefined])(
  "review capability refuses %s profile before connecting",
  async (profile) => {
    vi.stubEnv("LEDGERONE_ENV", profile);
    await expect(
      PostExecutor.disposable({
        runtimeURL: local,
        verifierURL: local,
        expected: { version: "7", objects: {} },
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(pool).not.toHaveBeenCalled();
  },
);
it.each([
  "postgresql://fixture:fixture@remote.invalid:5432/ledgerone_controls_0123456789abcdef_test?schema=public",
  "postgresql://fixture:fixture@127.0.0.1:5432/ledgerone?schema=public",
  "postgresql://fixture:fixture@127.0.0.1:5432/ledgerone_test?schema=public",
  local.replace("schema=public", "schema=ledgerone"),
  local + "&host=remote.invalid",
  local + "&options=unsafe",
  local.replace("fixture:fixture", "bad%3Brole:fixture"),
])(
  "review capability refuses invalid target without a database constructor",
  async (runtimeURL) => {
    vi.stubEnv("LEDGERONE_ENV", "test");
    await expect(
      PostExecutor.disposable({
        runtimeURL,
        verifierURL: local,
        expected: { version: "7", objects: {} },
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(pool).not.toHaveBeenCalled();
  },
);
it("review capability rejects a verifier on another generated database before connecting", async () => {
  vi.stubEnv("LEDGERONE_ENV", "test");
  await expect(
    PostExecutor.disposable({
      runtimeURL: local,
      verifierURL: local.replace("0123456789abcdef", "fedcba9876543210"),
      expected: { version: "7", objects: {} },
    }),
  ).rejects.toBeInstanceOf(Error);
  expect(pool).not.toHaveBeenCalled();
});
