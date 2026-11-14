"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Wallet, ArrowLeft, Archive, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { formatAmount, parseAmount } from "@/lib/ledger/money";
import { accountKinds } from "@/lib/accounts/shared";
function signedMinor(value: string) {
  return value.startsWith("-")
    ? -parseAmount(value.slice(1), "INR")
    : parseAmount(value, "INR");
}
import type { AccountCommand, AccountResult } from "@/lib/accounts/contract";

type Account = {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  kind: string;
  currencyCode: string;
  archivedAt: string | null;
  balanceMinor: string;
  events: {
    id: string;
    action: string;
    data: AccountResult;
    effectiveAt: string;
  }[];
  activity: {
    id: string;
    side: string;
    nativeMinor: string;
    journal: {
      description: string;
      kind: string;
      effectiveAt: string;
      reversesJournalId: string | null;
    };
  }[];
};
type Data = { accounts: Account[]; workspaces: { id: string; name: string }[] };
function money(value: string, currency = "INR") {
  const [whole, fraction] = formatAmount(BigInt(value), currency).split(".");
  return `${currency === "INR" ? "₹" : currency + " "}${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : "." + fraction}`;
}
function indiaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());
}
const field = "grid gap-2 text-sm font-medium";
const select =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base";
export function Accounts({ accountId }: { accountId?: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false),
    [confirm, setConfirm] = useState(false),
    [asOf, setAsOf] = useState("");
  const [newName, setNewName] = useState(""),
    [kind, setKind] = useState<(typeof accountKinds)[number]>("BANK"),
    [amount, setAmount] = useState("0"),
    [date, setDate] = useState(indiaToday()),
    [workspace, setWorkspace] = useState(""),
    [rename, setRename] = useState(""),
    [statement, setStatement] = useState("");
  const retry = useRef<{ body: string; key: string; workspace: string } | null>(
    null,
  );
  const reload = useCallback(async () => {
    const response = await fetch(
      "/api/accounts" +
        (asOf
          ? "?asOf=" + encodeURIComponent(asOf + "T23:59:59.999+05:30")
          : ""),
      { cache: "no-store" },
    );
    if (!response.ok) throw Error("Could not load accounts. Please try again.");
    const result: Data = await response.json();
    setData(result);
  }, [asOf]);
  useEffect(() => {
    let live = true;
    reload().catch((e) => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, [reload]);
  async function command(body: AccountCommand, scope: string) {
    const serialized = JSON.stringify(body);
    const hadPending = retry.current !== null;
    if (
      retry.current &&
      (retry.current.body !== serialized || retry.current.workspace !== scope)
    )
      throw Error("Recover the pending result before changing these details.");
    retry.current ??= {
      body: serialized,
      key: crypto.randomUUID(),
      workspace: scope,
    };
    const response = await fetch("/api/accounts?workspace=" + scope, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": retry.current!.key,
      },
      body: serialized,
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status < 500 && !hadPending) retry.current = null;
      throw Error(
        result.error === "account_writes_unavailable"
          ? "Account changes are unavailable in this environment."
          : response.status === 503
            ? "The result could not be confirmed. Retry the same request to recover safely."
            : "The account could not be saved. Check your inputs and access.",
      );
    }
    retry.current = null;
    try {
      await reload();
    } catch {
      setError(
        "Saved successfully, but the updated view could not load. Refresh to see it.",
      );
    }
    return result as AccountResult;
  }
  async function act(body: AccountCommand, scope: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await command(body, scope);
      setSuccess("Account saved.");
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      signedMinor(amount);
      if (!newName.trim() || !date)
        throw Error("Enter a name, amount and date.");
      if (!confirm) {
        setConfirm(true);
        return;
      }
      let scope = workspace || data?.workspaces[0]?.id;
      if (!scope) {
        setBusy(true);
        const response = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Personal finances" }),
        });
        if (response.status === 409) {
          // Another tab may have created the same owned workspace after loading.
          const existing = await fetch("/api/workspaces", {
            cache: "no-store",
          });
          if (!existing.ok) throw Error("Could not load your workspace.");
          const owned: { id: string; name: string }[] = await existing.json();
          scope = owned.find((w) => w.name === "Personal finances")?.id;
          if (!scope) throw Error("Could not find your workspace.");
        } else {
          if (!response.ok) throw Error("Could not create your workspace.");
          const created = await response.json();
          scope = created.id;
        }
        setWorkspace(scope!);
      }
      const result = await act(
        {
          kind: "CREATE_ACCOUNT",
          name: newName,
          accountKind: kind,
          opening: amount,
          effectiveAt: date + "T00:00:00+05:30",
        },
        scope!,
      );
      if (result) {
        setAdding(false);
        setConfirm(false);
        router.push("/accounts/" + result.accountId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the opening amount.");
      setBusy(false);
    }
  }
  const account = accountId
    ? data?.accounts.find((a) => a.id === accountId)
    : undefined;
  const totals = data?.accounts.reduce(
    (sum, a) =>
      sum +
      (a.currencyCode !== "INR"
        ? 0n
        : a.type === "ASSET"
          ? BigInt(a.balanceMinor)
          : -BigInt(a.balanceMinor)),
    0n,
  );
  return (
    <div className="grid gap-6">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR FINANCIAL ACCOUNTS</p>
          <h1 className="break-words">{account?.name ?? "Accounts"}</h1>
          <p className="page-description">
            {account
              ? "Balances and the history behind them."
              : "See where your money is held and what you owe."}
          </p>
        </div>
        {!accountId && (
          <Button
            onClick={() => {
              setAdding(true);
              setConfirm(false);
            }}
          >
            <Plus aria-hidden="true" />
            Add Account
          </Button>
        )}
      </div>
      {error && (
        <div role="alert" className="rounded-xl border border-destructive p-4">
          {error}
          {retry.current && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                const pending = retry.current!;
                const result = await act(
                  JSON.parse(pending.body),
                  pending.workspace,
                );
                if (result?.kind === "CREATE_ACCOUNT") {
                  setAdding(false);
                  setConfirm(false);
                  router.push("/accounts/" + result.accountId);
                }
              }}
            >
              Recover pending result
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setError("");
              reload().catch((e) => setError(e.message));
            }}
          >
            Retry loading
          </Button>
        </div>
      )}
      {success && (
        <p role="status" className="rounded-xl bg-muted p-4">
          {success}
        </p>
      )}
      {!data && !error && <p role="status">Loading your accounts…</p>}
      {adding && (
        <Card>
          <form
            onSubmit={create}
            className="grid max-w-2xl gap-5"
            aria-label="Create account"
          >
            <h2 className="text-xl font-semibold">
              {confirm ? "Confirm opening balance" : "Add an account"}
            </h2>
            <label className={field}>
              Account name
              <Input
                required
                maxLength={80}
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setConfirm(false);
                }}
                autoFocus
              />
            </label>
            <label className={field}>
              Account type
              <select
                className={select}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as typeof kind);
                  setConfirm(false);
                }}
              >
                {accountKinds.map((k) => (
                  <option key={k} value={k}>
                    {label(k)}
                  </option>
                ))}
              </select>
            </label>
            {data && data.workspaces.length > 1 && (
              <label className={field}>
                Workspace
                <select
                  className={select}
                  value={workspace || data.workspaces[0]!.id}
                  onChange={(e) => setWorkspace(e.target.value)}
                >
                  {data.workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={field}>
                Opening amount (INR)
                <Input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setConfirm(false);
                  }}
                  aria-describedby="opening-help"
                />
              </label>
              <label className={field}>
                Opening date
                <Input
                  required
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setConfirm(false);
                  }}
                />
              </label>
            </div>
            <p id="opening-help" className="text-sm text-muted-foreground">
              Use a positive amount for money held or debt owed. Negative
              amounts represent an overdraft or credit. Dates use India time.
            </p>
            {confirm && (
              <p role="status" className="rounded-xl bg-muted p-4">
                {newName} · {money(signedMinor(amount).toString())} · {date}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : confirm
                    ? "Confirm and save"
                    : "Review account"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setAdding(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
      {data && !accountId && (
        <>
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Net account balance · INR
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums [overflow-wrap:anywhere]">
                  {money(totals!.toString())}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Assets less liabilities, including archived INR accounts.
                </p>
              </div>
              <Wallet aria-hidden="true" className="text-primary" />
            </div>
          </Card>
          {data.accounts.length === 0 ? (
            <Card>
              <h2 className="text-xl font-semibold">
                Your first account starts here
              </h2>
              <p className="mt-2 text-muted-foreground">
                Add a bank account, cash wallet or credit card with its opening
                balance.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.accounts.map((a) => (
                <Card key={a.id}>
                  <p className="text-sm text-muted-foreground">
                    {label(a.kind)}
                    {a.archivedAt ? " · Archived" : ""}
                  </p>
                  <Link
                    className="mt-2 block text-xl font-semibold underline-offset-4 hover:underline"
                    href={"/accounts/" + a.id}
                  >
                    {a.name}
                  </Link>
                  <p className="mt-4 text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]">
                    {money(a.balanceMinor, a.currencyCode)}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      {data && accountId && !account && (
        <Card>
          <h2 className="text-xl font-semibold">Account unavailable</h2>
          <p className="mt-2">
            This account could not be found in your workspace.
          </p>
          <Link href="/accounts" className="mt-4 inline-block underline">
            Back to accounts
          </Link>
        </Card>
      )}
      {account && (
        <>
          <Link
            className="flex items-center gap-2 text-sm text-muted-foreground"
            href="/accounts"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            All accounts
          </Link>
          <Card>
            <p className="text-sm text-muted-foreground">
              {label(account.kind)} · {account.currencyCode}
              {account.archivedAt ? " · Archived" : ""}
            </p>
            <h2 className="mt-3 text-sm text-muted-foreground">
              {asOf ? "Balance as of " + asOf : "Current ledger balance"}
            </h2>
            <p
              className="mt-2 text-4xl font-semibold tabular-nums [overflow-wrap:anywhere]"
              data-testid="account-balance"
            >
              {money(account.balanceMinor, account.currencyCode)}
            </p>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Manage account</h2>
            <form
              className="mt-4 flex flex-wrap items-end gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                await act(
                  {
                    kind: "RENAME_ACCOUNT",
                    accountId: account.id,
                    name: rename,
                  },
                  account.workspaceId,
                );
                setRename("");
              }}
            >
              <label className={field}>
                New account name
                <Input
                  required
                  value={rename}
                  maxLength={80}
                  onChange={(e) => setRename(e.target.value)}
                />
              </label>
              <Button type="submit" disabled={busy}>
                Rename account
              </Button>
            </form>
            <Button
              variant="outline"
              className="mt-4"
              disabled={busy}
              onClick={() =>
                act(
                  {
                    kind: account.archivedAt
                      ? "RESTORE_ACCOUNT"
                      : "ARCHIVE_ACCOUNT",
                    accountId: account.id,
                  },
                  account.workspaceId,
                )
              }
            >
              {account.archivedAt ? (
                <RotateCcw aria-hidden="true" />
              ) : (
                <Archive aria-hidden="true" />
              )}
              {account.archivedAt ? "Restore account" : "Archive account"}
            </Button>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">
              Reconcile with a statement
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Compare your ledger to a statement. Recording a check preserves
              posted history.
            </p>
            <form
              className="mt-5 grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                act(
                  {
                    kind: "RECONCILE_ACCOUNT",
                    accountId: account.id,
                    statement,
                    effectiveAt: (asOf || indiaToday()) + "T23:59:59.999+05:30",
                  },
                  account.workspaceId,
                );
              }}
            >
              <label className={field}>
                Balance as of (India date)
                <Input
                  type="date"
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                />
              </label>
              <label className={field}>
                Statement balance (INR)
                <Input
                  required
                  inputMode="decimal"
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                />
              </label>
              <Button
                type="submit"
                disabled={busy}
                className="sm:col-span-2 sm:justify-self-start"
              >
                Record reconciliation
              </Button>
            </form>
            {account.events
              .filter((e) => e.action === "RECONCILE_ACCOUNT")
              .map((e) => (
                <div key={e.id} className="mt-4 rounded-xl bg-muted p-4">
                  <strong>
                    {e.data.differenceMinor === "0"
                      ? "Reconciled"
                      : "Discrepancy"}
                  </strong>
                  <p>
                    Ledger {money(e.data.ledgerMinor!)} · Statement{" "}
                    {money(e.data.statementMinor!)}
                  </p>
                  <p data-testid="discrepancy">
                    Difference {money(e.data.differenceMinor!)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(e.effectiveAt).toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}
                  </p>
                </div>
              ))}
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Recent account activity</h2>
            {!account.activity.length ? (
              <p className="mt-3 text-muted-foreground">
                No posted entries yet. A zero opening creates no journal.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {account.activity.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-4"
                  >
                    <div>
                      <p className="font-medium">{p.journal.description}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {label(p.journal.kind)} ·{" "}
                        {new Date(p.journal.effectiveAt).toLocaleDateString(
                          "en-IN",
                          { timeZone: "Asia/Kolkata" },
                        )}
                        {p.journal.reversesJournalId
                          ? " · Reverses an earlier entry"
                          : ""}
                      </p>
                    </div>
                    <p className="tabular-nums [overflow-wrap:anywhere]">
                      {money(
                        ((p.side === "DEBIT") === (account.type === "ASSET")
                          ? BigInt(p.nativeMinor)
                          : -BigInt(p.nativeMinor)
                        ).toString(),
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              Showing up to 100 recent entries and account changes.
            </p>
            <h3 className="mt-6 font-semibold">Recent account changes</h3>
            <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
              {account.events
                .filter((e) => e.action !== "RECONCILE_ACCOUNT")
                .map((e) => (
                  <li key={e.id}>
                    {label(e.action)} ·{" "}
                    {e.action === "RENAME_ACCOUNT" && e.data.previousName
                      ? e.data.previousName + " → "
                      : ""}
                    {e.data.name}
                  </li>
                ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
