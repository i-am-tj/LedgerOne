import { findCategory, type CategoryDef } from "@/lib/wealth/catalog";
import {
  addTenure,
  depositMaturityEstimate,
  marketValue,
  tenureLabel,
} from "@/lib/wealth/compute";
import type { Holding } from "@/lib/wealth/types";
import { formatDate, minorToNumber, rupees, rupeesNumber } from "./client";

export function categoryOf(holding: Holding): CategoryDef {
  return findCategory(holding.category)!;
}

export function maturityDate(d: Record<string, string>) {
  return (
    d.maturityDate ??
    addTenure(d.startDate, d.tenureYears, d.tenureMonths, d.tenureDays)
  );
}

export type Facts = {
  subtitle: string[];
  valueLabel: string;
  value: string;
  extra?: { label: string; value: string; tone?: "up" | "down" };
};

const option = (category: CategoryDef, key: string, value?: string) =>
  value
    ? (category.fields
        .find((f) => f.key === key)
        ?.options?.find((o) => o.value === value)?.label ?? value)
    : undefined;

export function holdingFacts(holding: Holding): Facts {
  const c = categoryOf(holding);
  const d = holding.details;
  const balance = rupees(holding.balanceMinor);
  const masked =
    holding.secretMasks.accountNumber ??
    holding.secretMasks.depositNumber ??
    holding.secretMasks.loanAccountNumber;
  const subtitle: string[] = [];
  switch (c.section) {
    case "liquid": {
      if (c.ledgerKind === "FIXED_DEPOSIT") {
        const m = maturityDate(d);
        if (m) subtitle.push(`Matures ${formatDate(m)}`);
        if (d.interestRate) subtitle.push(`${d.interestRate}% p.a.`);
        if (!m && tenureLabel(d)) subtitle.push(tenureLabel(d)!);
        const estimate =
          d.maturityAmount ??
          depositMaturityEstimate(minorToNumber(holding.balanceMinor), d)
            ?.maturity;
        return {
          subtitle: subtitle.length ? subtitle : [c.singular],
          valueLabel: c.id === "fixed-deposits" ? "Principal" : "Deposited",
          value: balance,
          ...(estimate !== undefined
            ? {
                extra: {
                  label: d.maturityAmount ? "At maturity" : "Est. at maturity",
                  value: rupeesNumber(
                    d.maturityAmount
                      ? Number(estimate)
                      : Math.round(Number(estimate)),
                  ),
                },
              }
            : {}),
        };
      }
      subtitle.push(c.id === "current" ? "Current account" : c.singular);
      if (masked) subtitle.push(masked);
      return { subtitle, valueLabel: "Available balance", value: balance };
    }
    case "markets": {
      if (c.id === "mutual-funds") {
        const plan = [option(c, "plan", d.plan), option(c, "option", d.option)]
          .filter(Boolean)
          .join(" · ");
        if (d.schemeName) subtitle.push(d.schemeName);
        if (plan) subtitle.push(plan);
        if (d.units) subtitle.push(`${d.units} units`);
      } else if (c.id === "stocks") {
        if (d.symbol) subtitle.push(`${d.exchange ?? "NSE"}: ${d.symbol}`);
        if (d.quantity) subtitle.push(`${d.quantity} shares`);
      } else if (c.id === "bonds") {
        const t = option(c, "bondType", d.bondType);
        if (t) subtitle.push(t);
        if (d.couponRate) subtitle.push(`${d.couponRate}% coupon`);
        if (d.maturityDate)
          subtitle.push(`Matures ${formatDate(d.maturityDate)}`);
      } else if (c.id === "nsc" || c.id === "ppf") {
        if (d.interestRate) subtitle.push(`${d.interestRate}% p.a.`);
        if (d.maturityDate)
          subtitle.push(`Matures ${formatDate(d.maturityDate)}`);
      }
      if (!subtitle.length) subtitle.push(c.singular);
      const current = marketValue(d);
      if (current === undefined)
        return { subtitle, valueLabel: "Invested", value: balance };
      const gain = current - minorToNumber(holding.balanceMinor);
      return {
        subtitle,
        valueLabel: "Current value",
        value: rupeesNumber(current),
        extra: {
          label: "Invested " + balance,
          value: rupeesNumber(gain, { sign: true }),
          tone: gain >= 0 ? "up" : "down",
        },
      };
    }
    case "liabilities": {
      if (d.cardLast4) subtitle.push(`•••• ${d.cardLast4}`);
      const network = option(c, "network", d.network);
      if (network) subtitle.push(network);
      if (d.interestRate) subtitle.push(`${d.interestRate}% p.a.`);
      if (d.emi) subtitle.push(`EMI ${rupeesNumber(Number(d.emi))}`);
      if (!subtitle.length) subtitle.push(c.singular);
      return { subtitle, valueLabel: "Outstanding", value: balance };
    }
    default: {
      subtitle.push(c.singular);
      const current = marketValue(d);
      return current === undefined
        ? { subtitle, valueLabel: "Book value", value: balance }
        : {
            subtitle,
            valueLabel: "Estimated value",
            value: rupeesNumber(current),
            extra: { label: "Book value", value: balance },
          };
    }
  }
}

/** Net worth in minor units: assets less liabilities (INR, active + archived). */
export function netWorthMinor(holdings: Holding[]) {
  return holdings.reduce(
    (sum, h) =>
      h.currencyCode !== "INR"
        ? sum
        : h.type === "ASSET"
          ? sum + BigInt(h.balanceMinor)
          : sum - BigInt(h.balanceMinor),
    0n,
  );
}
