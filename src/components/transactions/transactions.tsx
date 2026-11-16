"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { formatAmount } from "@/lib/ledger/money";
import { expenseCategories, incomeCategories } from "@/lib/transactions/shared";
type Account = {
  id: string;
  workspaceId: string;
  name: string;
  kind: string;
  type: "ASSET" | "LIABILITY";
  currencyCode: string;
  archivedAt: string | null;
  balanceMinor: string;
};
type Row = {
  operationId: string;
  kind: string;
  accountName: string;
  categoryName: string | null;
  destinationAccountName?: string;
  amountMinor: string;
  journal: {
    effectiveAt: string;
    description: string;
    reversal: { id: string } | null;
  } | null;
};
type Data = {
  accounts: Account[];
  transactions: Row[];
  summary: { expenseMinor: string; incomeMinor: string };
};
function money(s: string) {
  const [whole, fraction] = formatAmount(BigInt(s), "INR").split(".");
  return "₹" + whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction;
}
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
const select =
  "min-h-11 rounded-lg border border-border bg-background px-3 text-base";
export function Transactions() {
  const [data, setData] = useState<Data | null>(null),
    [kind, setKind] = useState<
      "EXPENSE" | "INCOME" | "TRANSFER" | "CARD_SETTLEMENT"
    >("EXPENSE"),
    [accountId, setAccount] = useState(""),
    [destinationId, setDestination] = useState(""),
    [amount, setAmount] = useState(""),
    [category, setCategory] = useState("Groceries"),
    [date, setDate] = useState(today),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const pending = useRef<{
    body: string;
    key: string;
    workspace: string;
  } | null>(null);
  const reload = useCallback(async () => {
    const r = await fetch("/api/transactions", { cache: "no-store" });
    if (!r.ok) throw Error("Could not load your transactions.");
    setData(await r.json());
  }, []);
  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [reload]);
  const accounts =
    data?.accounts.filter(
      (a) =>
        !a.archivedAt &&
        a.currencyCode === "INR" &&
        (["BANK", "CASH"].includes(a.kind) ||
          (kind === "EXPENSE" && a.kind === "CREDIT_CARD")),
    ) ?? [];
  const account = accountId
    ? accounts.find((a) => a.id === accountId)
    : accounts[0];
  const movement = kind === "TRANSFER" || kind === "CARD_SETTLEMENT";
  const destinations =
    data?.accounts.filter(
      (a) =>
        !a.archivedAt &&
        a.currencyCode === "INR" &&
        a.workspaceId === account?.workspaceId &&
        a.id !== account?.id &&
        (kind === "TRANSFER"
          ? a.type === "ASSET" && ["BANK", "CASH"].includes(a.kind)
          : a.type === "LIABILITY" && a.kind === "CREDIT_CARD"),
    ) ?? [];
  const destination = destinationId
    ? destinations.find((a) => a.id === destinationId)
    : destinations[0];
  async function save(body: string, workspace: string) {
    if (
      pending.current &&
      (pending.current.body !== body || pending.current.workspace !== workspace)
    )
      throw Error(
        "Recover the pending transaction before changing its details.",
      );
    const recovering = pending.current !== null;
    pending.current ??= { body, workspace, key: crypto.randomUUID() };
    const response = await fetch("/api/transactions?workspace=" + workspace, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": pending.current.key,
      },
      body,
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status < 500 && !recovering) pending.current = null;
      throw Error(
        response.status === 503
          ? "The outcome is unconfirmed. Recover the pending transaction safely."
          : result.error === "card_payment_exceeds_liability"
            ? "Payment exceeds the card liability at the selected date or a later posted date. Overpayments are not supported."
            : "Could not save. Check the account, category and amount.",
      );
    }
    pending.current = null;
    setAmount("");
    setSuccess("Transaction saved.");
    try {
      await reload();
    } catch {
      setError("Saved successfully. Refresh to load the updated history.");
    }
  }
  async function submit(event?: FormEvent, recover = false) {
    event?.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (recover && pending.current)
        await save(pending.current.body, pending.current.workspace);
      else if (account) {
        if (movement && !destination)
          throw Error(
            "Choose a different eligible destination in the same workspace.",
          );
        await save(
          JSON.stringify({
            kind,
            ...(movement
              ? {
                  sourceAccountId: account.id,
                  destinationAccountId: destination!.id,
                }
              : { accountId: account.id, category }),
            amount,
            effectiveAt: date + "T00:00:00+05:30",
            description,
          }),
          account.workspaceId,
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save the transaction.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-6">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVERYDAY FINANCES</p>
          <h1>Transactions</h1>
          <p className="page-description">
            Record purchases, income, transfers and card payments in your
            accounts.
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="rounded-xl border border-destructive p-4">
          {error}
          {pending.current ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => submit(undefined, true)}
            >
              Recover pending transaction
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() =>
                reload()
                  .then(() => setError(""))
                  .catch((e) => setError(e.message))
              }
            >
              Retry loading
            </Button>
          )}
        </div>
      )}
      {success && (
        <p role="status" className="rounded-xl bg-muted p-4">
          {success}
        </p>
      )}
      {!data && !error && <p role="status">Loading your transactions…</p>}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-sm text-muted-foreground">
                Consumption to date · INR
              </p>
              <p
                className="mt-2 text-2xl font-semibold tabular-nums"
                data-testid="consumption"
              >
                {money(data.summary.expenseMinor)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-muted-foreground">
                Income to date · INR
              </p>
              <p
                className="mt-2 text-2xl font-semibold tabular-nums"
                data-testid="income-total"
              >
                {money(data.summary.incomeMinor)}
              </p>
            </Card>
          </div>
          <Card>
            <h2 className="text-xl font-semibold">Record a transaction</h2>
            {!accounts.length ? (
              <p className="mt-4">
                Add an active INR bank, cash or credit-card account to begin.{" "}
                <Link href="/accounts" className="underline">
                  Open Accounts
                </Link>
              </p>
            ) : null}
            <form
              onSubmit={(e) => submit(e)}
              className="mt-5 grid gap-5 sm:grid-cols-2"
            >
              <label className="grid gap-2 text-sm font-medium">
                Transaction type
                <select
                  className={select}
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as typeof kind;
                    setKind(k);
                    setCategory(k === "EXPENSE" ? "Groceries" : "Salary");
                    setAccount("");
                    setDestination("");
                  }}
                >
                  <option value="EXPENSE">Expense</option>
                  <option value="INCOME">Income</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="CARD_SETTLEMENT">Credit-card payment</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                {kind === "EXPENSE"
                  ? "Paid from account"
                  : kind === "INCOME"
                    ? "Receive into account"
                    : kind === "TRANSFER"
                      ? "Source account"
                      : "Paying account"}
                <select
                  required
                  className={select}
                  value={account?.id ?? ""}
                  onChange={(e) => {
                    setAccount(e.target.value);
                    setDestination("");
                  }}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ·{" "}
                      {a.kind === "CREDIT_CARD"
                        ? "Credit card"
                        : a.kind === "CASH"
                          ? "Cash"
                          : "Bank"}
                    </option>
                  ))}
                </select>
              </label>
              {movement && (
                <label className="grid gap-2 text-sm font-medium">
                  {kind === "TRANSFER"
                    ? "Destination account"
                    : "Credit-card account"}
                  <select
                    className={select}
                    required
                    value={destination?.id ?? ""}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    <option value="" disabled>
                      Choose an eligible account
                    </option>
                    {destinations.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  {!destinations.length && (
                    <span>
                      No eligible{" "}
                      {kind === "TRANSFER"
                        ? "bank/cash destination"
                        : "credit card"}{" "}
                      in this workspace.{" "}
                      <Link href="/accounts" className="underline">
                        Manage accounts
                      </Link>
                    </span>
                  )}
                </label>
              )}
              <label className="grid gap-2 text-sm font-medium">
                Amount (INR)
                <Input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Transaction date (India)
                <Input
                  required
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              {!movement && (
                <label className="grid gap-2 text-sm font-medium">
                  Category
                  <select
                    required
                    className={select}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {(kind === "EXPENSE"
                      ? expenseCategories
                      : incomeCategories
                    ).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="grid gap-2 text-sm font-medium">
                Description (optional)
                <Input
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              {account && (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  {account.name} balance{" "}
                  <strong data-testid="selected-account-balance">
                    {money(account.balanceMinor)}
                  </strong>{" "}
                  ·{" "}
                  <Link className="underline" href={"/accounts/" + account.id}>
                    Account details
                  </Link>
                </p>
              )}
              {movement && destination && (
                <div className="text-sm text-muted-foreground sm:col-span-2">
                  <p>
                    {destination.name}{" "}
                    {kind === "CARD_SETTLEMENT" ? "liability" : "balance"}{" "}
                    <strong data-testid="destination-account-balance">
                      {money(destination.balanceMinor)}
                    </strong>
                  </p>
                  <p>
                    {kind === "TRANSFER"
                      ? "Selected accounts combined assets"
                      : "Selected accounts net worth"}{" "}
                    <strong data-testid="movement-net-worth">
                      {money(
                        (
                          BigInt(account?.balanceMinor ?? "0") +
                          (kind === "TRANSFER" ? 1n : -1n) *
                            BigInt(destination.balanceMinor)
                        ).toString(),
                      )}
                    </strong>
                  </p>
                  {kind === "CARD_SETTLEMENT" && (
                    <p>
                      Payments reduce card debt, not consumption. Partial
                      payments are allowed; overpayments, interest and fees are
                      not supported here. The amount is checked against
                      liability at the selected effective date.
                    </p>
                  )}
                </div>
              )}
              <Button
                type="submit"
                disabled={busy || !account || (movement && !destination)}
                className="sm:col-span-2 sm:justify-self-start"
              >
                {busy
                  ? "Saving…"
                  : kind === "EXPENSE"
                    ? "Save expense"
                    : kind === "INCOME"
                      ? "Save income"
                      : kind === "TRANSFER"
                        ? "Save transfer"
                        : "Pay credit-card bill"}
              </Button>
            </form>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Transaction history</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Up to 100 recent committed transactions. Summary totals use posted
              income and expense classifications through today.
            </p>
            {!data.transactions.length ? (
              <p className="mt-5 text-muted-foreground">
                No transactions yet. Your saved transactions will appear here.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {data.transactions.map((t) => (
                  <li
                    key={t.operationId}
                    className="flex flex-wrap items-start justify-between gap-3 py-4"
                    data-testid="transaction-row"
                    data-operation-id={t.operationId}
                  >
                    <div>
                      <p className="font-semibold">
                        {t.kind === "TRANSFER" ? (
                          "Transfer"
                        ) : t.kind === "CARD_SETTLEMENT" ? (
                          "Credit-card payment"
                        ) : (
                          <>
                            {t.categoryName} ·{" "}
                            {t.kind === "EXPENSE" ? "Expense" : "Income"}
                          </>
                        )}
                        {t.journal?.reversal ? " · Reversed" : ""}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t.accountName}
                        {t.destinationAccountName
                          ? " → " + t.destinationAccountName
                          : ""}{" "}
                        ·{" "}
                        {t.journal
                          ? new Date(t.journal.effectiveAt).toLocaleDateString(
                              "en-IN",
                              { timeZone: "Asia/Kolkata" },
                            )
                          : "Unavailable journal"}
                      </p>
                      {t.journal?.description && (
                        <p className="mt-2">{t.journal.description}</p>
                      )}
                    </div>
                    <p className="font-semibold tabular-nums [overflow-wrap:anywhere]">
                      {money(t.amountMinor)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
