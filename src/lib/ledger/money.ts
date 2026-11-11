export const CURRENCIES = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  KWD: 3,
} as const;
export type CurrencyCode = keyof typeof CURRENCIES;
export const MAX_MINOR = 999_999_999_999_999_999n;
export function currencyScale(code: string): number {
  if (!Object.hasOwn(CURRENCIES, code)) throw new Error("Unsupported currency");
  return CURRENCIES[code as CurrencyCode];
}
// Public monetary contracts take canonical strings, never Number/coercion.
export function parseAmount(value: unknown, currency: string): bigint {
  const scale = currencyScale(currency);
  if (
    typeof value !== "string" ||
    value.length > 24 ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)
  )
    throw new Error("Invalid amount");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > scale) throw new Error("Currency precision exceeded");
  const minor = BigInt(whole! + fraction.padEnd(scale, "0"));
  if (minor > MAX_MINOR) throw new Error("Amount exceeds supported range");
  return minor;
}
export function positiveMinor(value: unknown): bigint {
  if (typeof value !== "bigint" || value <= 0n || value > MAX_MINOR)
    throw new Error("Invalid positive minor units");
  return value;
}
export function formatAmount(minor: bigint, currency: string): string {
  if (typeof minor !== "bigint") throw new Error("Minor units must be bigint");
  const scale = currencyScale(currency);
  const sign = minor < 0n ? "-" : "";
  const digits = (minor < 0n ? -minor : minor)
    .toString()
    .padStart(scale + 1, "0");
  return (
    sign +
    (scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits)
  );
}
// Store a fixed-precision quote without introducing a rounding policy.
export function validateRate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d{0,11})(\.\d{1,18})?$/.test(value)
  )
    throw new Error("Invalid FX quote");
  const [whole, fraction = ""] = value.split(".");
  if (BigInt(whole! + fraction.padEnd(18, "0")) === 0n)
    throw new Error("FX quote must be positive");
  return value;
}
