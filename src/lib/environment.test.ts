import { describe, expect, it } from "vitest";
import { assertDemoSeedAllowed } from "./environment";
describe("P1-S01 development seed boundary", () => {
  const allowed = {
    NODE_ENV: "development",
    ALLOW_DEMO_SEED: "true",
    DATABASE_URL: "postgresql://dev:dev@127.0.0.1:5432/ledgerone",
  };
  it("permits an opted-in local development seed", () =>
    expect(() => assertDemoSeedAllowed(allowed)).not.toThrow());
  it.each(["production", "test", undefined])(
    "refuses %s even with opt-in",
    (NODE_ENV) =>
      expect(() => assertDemoSeedAllowed({ ...allowed, NODE_ENV })).toThrow(),
  );
  it("requires explicit opt-in", () =>
    expect(() =>
      assertDemoSeedAllowed({ ...allowed, ALLOW_DEMO_SEED: "false" }),
    ).toThrow());
  it("refuses non-loopback and malformed database addresses", () => {
    for (const DATABASE_URL of [
      "postgresql://dev:dev@remote.example/db",
      "invalid",
      "",
    ]) {
      expect(() =>
        assertDemoSeedAllowed({ ...allowed, DATABASE_URL }),
      ).toThrow();
    }
  });
});
