"use client";
import { useCallback, useEffect, useState } from "react";
import type { WealthOverview } from "@/lib/wealth/types";

const inr = new Intl.NumberFormat("en-IN");

/** ₹ with Indian digit grouping; paise shown only when present. */
export function rupees(minor: string | bigint, opts: { sign?: boolean } = {}) {
  const value = typeof minor === "bigint" ? minor : BigInt(minor);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const paise = abs % 100n;
  const text =
    "₹" +
    inr.format(whole) +
    (paise ? "." + paise.toString().padStart(2, "0") : "");
  if (negative) return "−" + text;
  return opts.sign && value > 0n ? "+" + text : text;
}
export function rupeesNumber(value: number, opts: { sign?: boolean } = {}) {
  return rupees(BigInt(Math.round(value * 100)), opts);
}
export function minorToNumber(minor: string) {
  return Number(BigInt(minor)) / 100;
}

export function formatDate(iso: string | undefined | null) {
  if (!iso) return undefined;
  const date = new Date(iso.length === 10 ? iso + "T00:00:00+05:30" : iso);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
export function indiaDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
export const indiaToday = () => indiaDate(new Date().toISOString());

export function useWealth() {
  const [data, setData] = useState<WealthOverview | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setError("");
    const response = await fetch("/api/wealth", { cache: "no-store" });
    if (!response.ok) throw Error("Could not load your wealth. Try again.");
    setData(await response.json());
  }, []);
  useEffect(() => {
    let live = true;
    reload().catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [reload]);
  return {
    data,
    error,
    reload: () => reload().catch((e: Error) => setError(e.message)),
  };
}

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

const messages: Record<string, string> = {
  account_writes_unavailable:
    "Account changes are unavailable in this environment. Use the local preview server (see README › Wealth).",
  transaction_writes_unavailable:
    "Ledger movements are unavailable in this environment.",
  vault_unavailable:
    "Sensitive identifiers can't be saved or shown: LEDGERONE_VAULT_KEY is not configured.",
  stale_profile:
    "These details changed in another tab. Reload to see the latest before saving again.",
  invalid_profile: "Some details need attention.",
  invalid_account_type: "Choose a bank or cash account to fund this.",
  account_unavailable: "One of the accounts is archived or unavailable.",
};

export async function send<T>(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new RequestError(
      messages[result.error] ??
        (response.status >= 500
          ? "The result could not be confirmed. Retry to recover safely."
          : "That couldn't be saved. Check your details and access."),
      response.status,
      result.fields,
    );
  return result as T;
}

/** Ensures the owner has a workspace (mirrors the Accounts flow). */
export async function ensureWorkspace(existing?: string) {
  if (existing) return existing;
  const response = await fetch("/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Personal finances" }),
  });
  if (response.status === 409) {
    const owned = await fetch("/api/workspaces", { cache: "no-store" });
    if (!owned.ok) throw Error("Could not load your workspace.");
    const list: { id: string; name: string }[] = await owned.json();
    const found = list.find((w) => w.name === "Personal finances") ?? list[0];
    if (!found) throw Error("Could not find your workspace.");
    return found.id;
  }
  if (!response.ok) throw Error("Could not create your workspace.");
  return ((await response.json()) as { id: string }).id;
}
