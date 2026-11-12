import { expect, it } from "vitest";
import {
  correctionResult,
  assertResultSemantics,
  type StoredJournal,
} from "./results";
const scope = {
  ownerId: "owner",
  workspaceId: "workspace",
  operationId: "operation",
};
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];
const reversal: StoredJournal = {
  ...scope,
  journalId: "reversal",
  kind: "REVERSAL",
  status: "POSTED",
  reversesJournalId: "original",
  effectiveAt: "2026-02-01T00:00:00.000Z",
  postedAt: "2026-11-12T00:00:00.000Z",
  description: "Stored description",
  legs: ids.map((id, i) => ({
    accountId: id,
    side: i ? "CREDIT" : "DEBIT",
    currency: "INR",
    nativeMinor: "100",
    functionalMinor: "100",
    fxRateId: null,
  })),
};
const replacement: StoredJournal = {
  ...reversal,
  journalId: "replacement",
  kind: "GENERAL",
  reversesJournalId: null,
  effectiveAt: "2026-03-01T00:00:00.000Z",
};
it("C-T01 recovery requires exact original, scope and child multiset; immutable separate dates", () => {
  const r = correctionResult(scope, "CORRECT", "original", "Reason", [
    replacement,
    reversal,
  ]);
  expect(r.kind).toBe("CORRECT");
  if (r.kind !== "CORRECT") throw Error();
  expect(r.originalJournalId).toBe("original");
  expect(r.reversal.effectiveAt).not.toBe(r.replacement.effectiveAt);
  expect(Object.keys(r.reversal).sort()).toEqual([
    "description",
    "effectiveAt",
    "journalId",
    "legs",
    "postedAt",
  ]);
  expect(
    correctionResult(scope, "REVERSE", "original", "Reason", [reversal]).kind,
  ).toBe("REVERSE");
});
it("C-T01 replay rejects incomplete, foreign, wrong-target, own-replacement and duplicated children", () => {
  for (const rows of [
    [],
    [replacement],
    [reversal],
    [reversal, reversal],
    [{ ...reversal, reversesJournalId: "replacement" }, replacement],
    [{ ...reversal, ownerId: "foreign" }, replacement],
    [{ ...reversal, workspaceId: "foreign" }, replacement],
    [{ ...reversal, status: "DRAFT" }, replacement],
    [{ ...reversal, journalId: "original" }, replacement],
  ])
    expect(() =>
      correctionResult(scope, "CORRECT", "original", "Reason", rows),
    ).toThrow("service_unavailable");
});

it("S06C-R01 reconstructs canonical semantics from immutable result without account metadata", () => {
  const original = "33333333-3333-4333-8333-333333333333";
  const expected = {
    kind: "CORRECT" as const,
    originalJournalId: original,
    effectiveAt: reversal.effectiveAt,
    description: reversal.description,
    reason: "Reason",
    replacement: {
      effectiveAt: replacement.effectiveAt,
      description: replacement.description,
      legs: ids.map((id, i) => ({
        accountId: id,
        side: (i ? "CREDIT" : "DEBIT") as "DEBIT" | "CREDIT",
        currency: "INR" as const,
        minor: "100",
      })),
    },
  };
  const good = correctionResult(scope, "CORRECT", original, "Reason", [
    { ...reversal, reversesJournalId: original },
    replacement,
  ]);
  expect(assertResultSemantics(scope, expected, good)).toBe(good);
  if (good.kind !== "CORRECT") throw Error();
  expect(
    assertResultSemantics(scope, expected, {
      ...good,
      replacement: {
        ...good.replacement,
        legs: [...good.replacement.legs].reverse(),
      },
    }),
  ).toEqual({
    ...good,
    replacement: {
      ...good.replacement,
      legs: [...good.replacement.legs].reverse(),
    },
  });
  for (const changed of [
    {
      ...good,
      reversal: { ...good.reversal, effectiveAt: "2026-04-01T00:00:00Z" },
    },
    {
      ...good,
      replacement: { ...good.replacement, description: "Wrong semantics" },
    },
    {
      ...good,
      replacement: {
        ...good.replacement,
        legs: good.replacement.legs.map((l) => ({
          ...l,
          nativeMinor: "200",
          functionalMinor: "200",
        })),
      },
    },
    {
      ...good,
      replacement: {
        ...good.replacement,
        legs: [...good.replacement.legs, ...good.replacement.legs],
      },
    },
  ])
    expect(() => assertResultSemantics(scope, expected, changed)).toThrow(
      "service_unavailable",
    );
});
