import { describe, it, expect } from "vitest";
import {
  assertLedgerInvariants,
  InvariantDriftError,
  type InvariantManifest,
} from "./invariants";
import { SCHEMA_VERSION } from "../schema-version";
describe("P1-S06A invariant comparator", () => {
  const good: InvariantManifest = {
    version: SCHEMA_VERSION,
    objects: {
      "check:a": "positive",
      "trigger:b": "enabled",
      "function:c": "invoker",
    },
  };
  it("accepts exact reviewed state independent of insertion order", () => {
    expect(() =>
      assertLedgerInvariants(
        {
          ...good,
          objects: Object.fromEntries(Object.entries(good.objects).reverse()),
        },
        good,
      ),
    ).not.toThrow();
  });
  it.each(["check:a", "trigger:b", "function:c"])(
    "detects changed %s",
    (key) => {
      expect(() =>
        assertLedgerInvariants(
          { ...good, objects: { ...good.objects, [key]: "changed" } },
          good,
        ),
      ).toThrow(InvariantDriftError);
    },
  );
  it("rejects extra/missing/empty objects and unknown manifest versions", () => {
    const invalid: InvariantManifest[] = [
      { ...good, objects: {} },
      { ...good, objects: { ...good.objects, extra: "unsafe" } },
      { ...good, objects: { "check:a": "positive" } },
      { ...good, version: "unknown" },
    ];
    for (const actual of invalid)
      expect(() => assertLedgerInvariants(actual, good)).toThrow(
        InvariantDriftError,
      );
  });
});

// Guard the operator/reference helper before it can connect or create a DB.
import { createFreshLedgerDatabase } from "../../../scripts/lib/fresh-ledger-database";
it.each([
  "postgresql://fixture:fixture@remote.invalid:5432/ledgerone_test",
  "postgresql://fixture:fixture@127.0.0.1:5432/ledgerone_test?host=remote.invalid",
  "postgresql://fixture:fixture@127.0.0.1:5432/ledgerone",
  "postgresql://fixture:fixture@127.0.0.1:5432/ledgerone_test?options=unsafe",
])(
  "P1-S06A rejects unsafe reference configuration before connecting",
  async (url) => {
    await expect(createFreshLedgerDatabase(url)).rejects.toBeInstanceOf(Error);
  },
);
