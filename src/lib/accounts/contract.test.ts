import { describe, expect, it } from "vitest";
import { accountHash, parseAccountCommand, signedMinor } from "./contract";
const create = {
  kind: "CREATE_ACCOUNT",
  name: "SBI Savings",
  accountKind: "BANK",
  opening: "50000",
  effectiveAt: "2026-01-01T00:00:00+05:30",
};
describe("S07 strict typed account contracts", () => {
  it("normalizes dates and exact signed minor units", () => {
    expect(parseAccountCommand(create)).toMatchObject({
      effectiveAt: "2025-12-31T18:30:00.000Z",
    });
    expect(signedMinor("-12.34")).toBe(-1234n);
    expect(signedMinor("9999999999999999.99")).toBe(999999999999999999n);
  });
  it.each([
    { ...create, ownerId: "forged" },
    { ...create, legs: [] },
    { ...create, accountKind: "EXPENSE" },
    { ...create, opening: 5 },
    { ...create, opening: "0.001" },
    { ...create, opening: "1e5" },
    { ...create, effectiveAt: "2026-02-30T00:00:00Z" },
    { kind: "POST", legs: [] },
  ])("rejects unsupported or unsafe inputs %#", (body) => {
    expect(() => parseAccountCommand(body)).toThrow();
  });
  it("binds canonical amounts, actor and scope", () => {
    const a = parseAccountCommand(create),
      b = parseAccountCommand({ ...create, opening: "50000.00" });
    expect(accountHash("a", "w", a)).toBe(accountHash("a", "w", b));
    expect(accountHash("b", "w", a)).not.toBe(accountHash("a", "w", a));
    expect(accountHash("a", "x", a)).not.toBe(accountHash("a", "w", a));
  });
});
