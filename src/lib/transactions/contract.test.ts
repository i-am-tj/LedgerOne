import { describe, expect, it } from "vitest";
import { captureHash, parseCapture } from "./contract";
const expense = {
  kind: "EXPENSE",
  accountId: "00000000-0000-4000-8000-000000000001",
  amount: "850",
  effectiveAt: "2026-01-01T00:00:00+05:30",
  category: "Groceries",
};
describe("S08-A typed capture validation", () => {
  it("normalizes exact amounts and instants for canonical replay", () => {
    const a = parseCapture(expense),
      b = parseCapture({ ...expense, amount: "850.00" });
    expect(a.effectiveAt).toBe("2025-12-31T18:30:00.000Z");
    expect(captureHash("owner", "workspace", a)).toBe(
      captureHash("owner", "workspace", b),
    );
    expect(captureHash("other", "workspace", a)).not.toBe(
      captureHash("owner", "workspace", a),
    );
  });
  it.each([
    { ...expense, amount: 850 },
    { ...expense, amount: "0" },
    { ...expense, amount: "-1" },
    { ...expense, amount: "1e3" },
    { ...expense, amount: "0.001" },
    { ...expense, ownerId: "forged" },
    { ...expense, legs: [] },
    { ...expense, category: "Salary" },
    { ...expense, effectiveAt: "2026-02-30T00:00:00Z" },
    { kind: "POST", legs: [] },
  ])("rejects unsafe capture %#", (body) =>
    expect(() => parseCapture(body)).toThrow(),
  );
});
