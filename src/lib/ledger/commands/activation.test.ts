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
  { runtime: "remote", auth: "fixture_auth" },
  { runtime: "local", auth: "fixture;SETROLE" },
  { runtime: "local", auth: "fixture" },
])(
  "D-T02 private target/role guard rejects $runtime/$auth without connections",
  async ({ runtime, auth }) => {
    vi.stubEnv("LEDGERONE_ENV", "test");
    const privateURL = local.replace("schema=public", "schema=ledgerone");
    await expect(
      PostExecutor.localPrivateVerification({
        runtimeURL:
          runtime === "remote"
            ? privateURL.replace("127.0.0.1", "remote.invalid")
            : privateURL,
        verifierURL: privateURL.replace("fixture:fixture", "verifier:fixture"),
        authRole: auth,
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

it.each([
  "schema=public",
  "schema=ledgerone%3Bpublic",
  "schema=%22ledgerone%22",
  "schema=pg_temp",
  "schema=ledgerone&options=-csearch_path=public",
])(
  "D-T02 private verifier rejects schema/identifier injection before connection: %s",
  async (schema) => {
    vi.stubEnv("LEDGERONE_ENV", "test");
    await expect(
      PostExecutor.localPrivateVerification({
        runtimeURL: local.replace("schema=public", schema),
        verifierURL: local
          .replace("fixture:fixture", "verifier:fixture")
          .replace("schema=public", schema),
        authRole: "fixture_auth",
        expected: { version: "7", objects: {} },
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(pool).not.toHaveBeenCalled();
  },
);
it.each(["production", "development", undefined])(
  "D-T02 private factory refuses %s before connection",
  async (profile) => {
    vi.stubEnv("LEDGERONE_ENV", profile);
    await expect(
      PostExecutor.localPrivateVerification({
        runtimeURL: local.replace("schema=public", "schema=ledgerone"),
        verifierURL: local
          .replace("fixture:fixture", "verifier:fixture")
          .replace("schema=public", "schema=ledgerone"),
        authRole: "fixture_auth",
        expected: { version: "7", objects: {} },
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(pool).not.toHaveBeenCalled();
  },
);
