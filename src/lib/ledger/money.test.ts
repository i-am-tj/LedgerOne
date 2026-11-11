import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  MAX_MINOR,
  parseAmount,
  positiveMinor,
  formatAmount,
  validateRate,
} from "./money";
import { CHART, normalBalance, normalSide } from "./chart";
describe("P1-S05 exact money and chart", () => {
  it("parses INR beyond JS safe integers without loss", () => {
    expect(parseAmount("90071992547409.93", "INR")).toBe(9007199254740993n);
    expect(parseAmount("9999999999999999.99", "INR")).toBe(MAX_MINOR);
    expect(formatAmount(MAX_MINOR, "INR")).toBe("9999999999999999.99");
    expect(parseAmount("0", "INR")).toBe(0n);
    expect(parseAmount("0.01", "INR")).toBe(1n);
  });
  it("respects zero/three-decimal currencies and signed displayed balances", () => {
    expect(parseAmount("123", "JPY")).toBe(123n);
    expect(parseAmount("1.001", "KWD")).toBe(1001n);
    expect(formatAmount(-1n, "KWD")).toBe("-0.001");
    expect(formatAmount(0n, "INR")).toBe("0.00");
    expect(formatAmount(-42n, "JPY")).toBe("-42");
    for (const code of Object.keys(CURRENCIES))
      for (const units of [0n, 1n, 19n, 12345678901234567n, MAX_MINOR])
        expect(parseAmount(formatAmount(units, code), code)).toBe(units);
  });
  it.each([
    1.01,
    NaN,
    Infinity,
    null,
    {},
    "",
    " 1",
    "1 ",
    "+1",
    "-1",
    "-0",
    "01",
    ".1",
    "1.",
    "1e2",
    "1,000.00",
    "0.001",
    "10000000000000000.00",
  ])("rejects unsafe amount input %j", (value) => {
    expect(() => parseAmount(value, "INR")).toThrow();
  });
  it("rejects incompatible currencies/precision and non-positive posting quantities", () => {
    for (const code of ["inr", "XXX", "", "__proto__"])
      expect(() => parseAmount("1", code)).toThrow();
    expect(() => parseAmount("1.0", "JPY")).toThrow();
    expect(() => parseAmount("1.0001", "KWD")).toThrow();
    for (const value of [0n, -1n, MAX_MINOR + 1n, 1, "1"])
      expect(() => positiveMinor(value)).toThrow();
    expect(positiveMinor(MAX_MINOR)).toBe(MAX_MINOR);
  });
  it("validates exact manual quotes without rounding them", () => {
    for (const rate of [
      "90",
      "90.123456789012345678",
      "0.000000000000000001",
      "999999999999.999999999999999999",
    ])
      expect(validateRate(rate)).toBe(rate);
    for (const rate of [
      90,
      "0",
      "0.000",
      "-1",
      "1e2",
      "NaN",
      "Infinity",
      "1000000000000",
      "1.1234567890123456789",
    ])
      expect(() => validateRate(rate)).toThrow();
  });
  it("keeps normal signs independent of economic journal templates", () => {
    for (const type of Object.values(CHART)) {
      const debit = type === "ASSET" || type === "EXPENSE";
      expect(normalSide(type)).toBe(debit ? "DEBIT" : "CREDIT");
      expect(normalBalance(-120000n, type)).toBe(debit ? -120000n : 120000n);
    }
    expect(() => normalSide("UNKNOWN" as never)).toThrow();
    expect(() => formatAmount(1 as unknown as bigint, "INR")).toThrow();
    expect(CHART.CREDIT_CARD).toBe("LIABILITY");
    expect(CHART.FIXED_DEPOSIT).toBe("ASSET");
    expect(CHART.LOAN).toBe("LIABILITY");
  });
});
