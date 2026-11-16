import { it, expect } from "vitest";
import {
  parseAccountCorrection,
  accountCorrectionHash,
} from "./correction-contract";
const base = {
  kind: "CORRECT_OPENING",
  accountId: "00000000-0000-4000-8000-000000000001",
  originalJournalId: "00000000-0000-4000-8000-000000000002",
  amount: "50000",
  effectiveAt: "2026-01-01T00:00:00+05:30",
  replacementEffectiveAt: "2026-02-01T00:00:00+05:30",
  reason: "Correct opening",
};
it.each(["0", "-100.12", "9999999999999999.99"])(
  "opening correction accepts exact signed amount %s",
  (amount) => {
    expect(parseAccountCorrection({ ...base, amount }).amount).toBe(amount);
  },
);
it.each([
  { amount: "0.001" },
  { amount: "10000000000000000" },
  { accountId: "bad" },
  { ownerId: "forged" },
  { legs: [] },
  { allowArchived: true },
  { reason: " " },
  { replacementEffectiveAt: "2026-02-30T00:00:00Z" },
  { kind: "CORRECT_ACCOUNT_ENTRY", amount: "-1" },
])("rejects forged or invalid correction %j", (bad) => {
  expect(() => parseAccountCorrection({ ...base, ...bad })).toThrow();
});
it("canonical binding includes the exact target, mode, dates, reason and normalized amount", () => {
  expect(
    accountCorrectionHash(
      "owner",
      "workspace",
      parseAccountCorrection({ ...base, reason: "Café" }),
    ),
  ).toBe(
    accountCorrectionHash(
      "owner",
      "workspace",
      parseAccountCorrection({ ...base, reason: "Cafe\u0301" }),
    ),
  );
  const a = parseAccountCorrection(base),
    hash = (c: typeof a) => accountCorrectionHash("owner", "workspace", c);
  expect(hash(a)).toBe(
    hash(parseAccountCorrection({ ...base, amount: "50000.00" })),
  );
  for (const change of [
    { amount: "50001" },
    { reason: "Other reason" },
    { effectiveAt: "2026-01-02T00:00:00Z" },
    { replacementEffectiveAt: "2026-02-02T00:00:00Z" },
    { kind: "CORRECT_ACCOUNT_ENTRY" },
  ])
    expect(hash(parseAccountCorrection({ ...base, ...change }))).not.toBe(
      hash(a),
    );
});
