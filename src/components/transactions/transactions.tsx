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
  currencyCode: string;
  archivedAt: string | null;
  balanceMinor: string;
};
type Row = {
  operationId: string;
  kind: string;
  accountName: string;
  categoryName: string;
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
    [kind, setKind] = useState<"EXPENSE" | "INCOME">("EXPENSE"),
    [accountId, setAccount] = useState(""),
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
    await response.json();
    if (!response.ok) {
      if (response.status < 500 && !recovering) pending.current = null;
      throw Error(
        response.status === 503
          ? "The outcome is unconfirmed. Recover the pending transaction safely."
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
      else if (account)
        await save(
          JSON.stringify({
            kind,
            accountId: account.id,
            amount,
            category,
            effectiveAt: date + "T00:00:00+05:30",
            description,
          }),
          account.workspaceId,
        );
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
            Record a purchase or income and follow its effect on your accounts.
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
                  }}
                >
                  <option value="EXPENSE">Expense</option>
                  <option value="INCOME">Income</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                {kind === "EXPENSE"
                  ? "Paid from account"
                  : "Receive into account"}
                <select
                  required
                  className={select}
                  value={account?.id ?? ""}
                  onChange={(e) => setAccount(e.target.value)}
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
              <Button
                type="submit"
                disabled={busy || !account}
                className="sm:col-span-2 sm:justify-self-start"
              >
                {busy
                  ? "Saving…"
                  : kind === "EXPENSE"
                    ? "Save expense"
                    : "Save income"}
              </Button>
            </form>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Transaction history</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Up to 100 recent committed captures. Summary totals use posted
              income and expense classifications through today.
            </p>
            {!data.transactions.length ? (
              <p className="mt-5 text-muted-foreground">
                No transactions yet. Your saved expenses and income will appear
                here.
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
                        {t.categoryName} ·{" "}
                        {t.kind === "EXPENSE" ? "Expense" : "Income"}
                        {t.journal?.reversal ? " · Reversed" : ""}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t.accountName} ·{" "}
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
