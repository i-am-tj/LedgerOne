// Display-only estimates for holding profiles. Never posted to the ledger.
const periods: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  "half-yearly": 2,
  yearly: 1,
};

function num(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value.replaceAll(",", ""));
  return Number.isFinite(n) ? n : undefined;
}

/** Adds a years/months/days tenure to an ISO date (UTC calendar arithmetic). */
export function addTenure(
  start: string | undefined,
  years?: string,
  months?: string,
  days?: string,
) {
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return undefined;
  const y = Math.trunc(num(years) ?? 0),
    m = Math.trunc(num(months) ?? 0),
    d = Math.trunc(num(days) ?? 0);
  if (!y && !m && !d) return undefined;
  const date = new Date(start + "T00:00:00Z");
  const targetMonth = date.getUTCMonth() + y * 12 + m;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(targetMonth);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  date.setUTCDate(date.getUTCDate() + d);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) /
      86400000,
  );
}

/**
 * Estimated maturity value in rupees for a cumulative deposit. Banks in India
 * usually compound quarterly; simple interest applies when chosen or when the
 * tenure is under one compounding period.
 */
export function depositMaturityEstimate(
  principalRupees: number,
  details: Record<string, string | undefined>,
) {
  const rate = num(details.interestRate);
  const start = details.startDate;
  const maturity =
    details.maturityDate ??
    addTenure(
      start,
      details.tenureYears,
      details.tenureMonths,
      details.tenureDays,
    );
  if (!rate || !start || !maturity || principalRupees <= 0) return undefined;
  const days = daysBetween(start, maturity);
  if (days <= 0) return undefined;
  const payout = details.payout ?? "cumulative";
  const years = days / 365;
  const r = rate / 100;
  if (payout !== "cumulative") {
    const n = periods[payout] ?? 4;
    return {
      maturity: round(principalRupees),
      interest: round(principalRupees * r * years),
      payoutPerPeriod: round((principalRupees * r) / n),
      days,
    };
  }
  const n = periods[details.compounding ?? "quarterly"];
  const amount =
    details.compounding === "simple" || !n || years < 1 / n
      ? principalRupees * (1 + r * years)
      : principalRupees * Math.pow(1 + r / n, n * years);
  return {
    maturity: round(amount),
    interest: round(amount - principalRupees),
    payoutPerPeriod: undefined,
    days,
  };
}

/** Market value from explicit value or quantity × price. */
export function marketValue(details: Record<string, string | undefined>) {
  const explicit = num(details.currentValue);
  if (explicit !== undefined) return explicit;
  const units = num(details.units) ?? num(details.quantity);
  const price = num(details.currentNav) ?? num(details.currentPrice);
  return units !== undefined && price !== undefined
    ? round(units * price)
    : undefined;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function tenureLabel(details: Record<string, string | undefined>) {
  const parts: string[] = [];
  const y = num(details.tenureYears),
    m = num(details.tenureMonths),
    d = num(details.tenureDays);
  if (y) parts.push(`${y}y`);
  if (m) parts.push(`${m}m`);
  if (d) parts.push(`${d}d`);
  return parts.join(" ") || undefined;
}
