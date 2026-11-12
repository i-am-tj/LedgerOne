import { expect, it } from "vitest";
import { correctionResult, type StoredJournal } from "./results";
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
