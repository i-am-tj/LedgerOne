"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  History,
  LockKeyhole,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  categoryHref,
  findSection,
  showsInstitutionLogo,
  type FieldDef,
} from "@/lib/wealth/catalog";
import {
  depositMaturityEstimate,
  daysBetween,
  tenureLabel,
} from "@/lib/wealth/compute";
import { cn } from "@/lib/utils";
import {
  formatDate,
  indiaToday,
  minorToNumber,
  rupeesNumber,
  send,
  useWealth,
} from "./client";
import { InstitutionLogo, resolveInstitution } from "./institution-logo";
import { categoryOf, holdingFacts, maturityDate } from "./summary";

const groupTitles: Record<FieldDef["group"], string> = {
  identity: "Identification",
  terms: "Terms",
  position: "Holdings & value",
  access: "Access & contact",
  other: "Other",
};

function display(def: FieldDef, value: string) {
  switch (def.type) {
    case "date":
      return formatDate(value) ?? value;
    case "money":
      return rupeesNumber(Number(value));
    case "percent":
      return `${value}% p.a.`;
    case "select":
      return def.options?.find((o) => o.value === value)?.label ?? value;
    default:
      return value;
  }
}

export function HoldingDetail({ holdingId }: { holdingId: string }) {
  const { data, error, reload } = useWealth();
  const [revealed, setRevealed] = useState<Record<string, string> | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const archiveKey = useRef(crypto.randomUUID());
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("created"))
      setNotice("Added. You can edit any detail later.");
    else if (params.get("saved")) setNotice("Details saved.");
  }, []);

  const holding = data?.holdings.find((h) => h.id === holdingId);
  if (!data)
    return error ? (
      <div role="alert" className="notice notice-error">
        <div>
          <strong>Couldn’t load</strong>
          <p>{error}</p>
          <Button variant="outline" className="mt-4" onClick={reload}>
            Try again
          </Button>
        </div>
      </div>
    ) : (
      <p role="status">Loading…</p>
    );
  if (!holding)
    return (
      <Card>
        <h1 className="text-xl font-semibold">Holding unavailable</h1>
        <p className="mt-2">
          This holding could not be found in your workspace.
        </p>
        <Link href="/wealth/liquid" className="mt-4 inline-block underline">
          Back to Wealth
        </Link>
      </Card>
    );

  const c = categoryOf(holding);
  const facts = holdingFacts(holding);
  const d = holding.details;
  const base = `${categoryHref(c)}/${holding.id}`;
  const institution = resolveInstitution(
    holding.institution,
    holding.institutionKey,
  );
  const platform = resolveInstitution(holding.platform, holding.platformKey);
  const deposit = c.ledgerKind === "FIXED_DEPOSIT";
  const maturity = deposit ? maturityDate(d) : undefined;
  const start = d.startDate;
  const estimate = deposit
    ? depositMaturityEstimate(minorToNumber(holding.balanceMinor), d)
    : undefined;
  const progress =
    start && maturity
      ? Math.min(
          1,
          Math.max(
            0,
            daysBetween(start, indiaToday()) /
              Math.max(1, daysBetween(start, maturity)),
          ),
        )
      : undefined;
  const daysLeft = maturity ? daysBetween(indiaToday(), maturity) : undefined;

  async function reveal() {
    if (revealed) return setShowSecrets((s) => !s);
    setProblem("");
    const response = await fetch(`/api/wealth/holdings/${holdingId}?reveal=1`, {
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setProblem(
        body.error === "vault_unavailable"
          ? "Encrypted identifiers can’t be opened: LEDGERONE_VAULT_KEY is not configured."
          : "Couldn’t reveal identifiers. Try again.",
      );
      return;
    }
    setRevealed(body.secrets);
    setShowSecrets(true);
  }

  async function toggleArchive() {
    if (!holding) return;
    if (!holding.archived && !confirmArchive) return setConfirmArchive(true);
    setBusy(true);
    setProblem("");
    try {
      await send(
        `/api/accounts?workspace=${holding.workspaceId}`,
        "POST",
        {
          kind: holding.archived ? "RESTORE_ACCOUNT" : "ARCHIVE_ACCOUNT",
          accountId: holding.id,
        },
        archiveKey.current,
      );
      archiveKey.current = crypto.randomUUID();
      setNotice(
        holding.archived ? "Restored." : "Archived. Its history is kept.",
      );
      setConfirmArchive(false);
      await reload();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const groups = (Object.keys(groupTitles) as FieldDef["group"][])
    .map((g) => ({
      id: g,
      rows: c.fields.filter(
        (f) =>
          f.group === g &&
          (f.secret ? holding.secretMasks[f.key] : d[f.key]) !== undefined,
      ),
    }))
    .filter((g) => g.rows.length);
  const hasSecrets = Object.keys(holding.secretMasks).length > 0;

  return (
    <div className="grid gap-6">
      <Link
        href={categoryHref(c)}
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {c.label}
      </Link>
      <div className="page-heading !mb-0">
        <div className="flex min-w-0 items-start gap-4">
          <InstitutionLogo
            name={
              showsInstitutionLogo(c)
                ? (holding.institution ?? holding.name)
                : null
            }
            institutionKey={holding.institutionKey}
            icon={c.icon}
            kinds={c.institutionKinds}
            size={56}
          />
          <div className="min-w-0">
            <p className="eyebrow">
              {findSection(c.section)!.label.toUpperCase()} ·{" "}
              {c.singular.toUpperCase()}
            </p>
            <h1 className="break-words">{holding.name}</h1>
            <p className="page-description">
              {[
                institution?.name ?? holding.institution,
                platform
                  ? `via ${platform.name}`
                  : holding.platform
                    ? `via ${holding.platform}`
                    : null,
              ]
                .filter(Boolean)
                .join(" · ") || c.description}
              {holding.archived && (
                <span className="subtle-badge ml-2">Archived</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={base + "/edit"}>
              <Pencil aria-hidden="true" />
              Edit details
            </Link>
          </Button>
        </div>
      </div>
      {notice && (
        <p role="status" className="notice notice-success">
          {notice}
        </p>
      )}
      {problem && (
        <p
          role="alert"
          className="rounded-xl border border-destructive p-4 text-sm"
        >
          {problem}
        </p>
      )}
      {!holding.hasProfile && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm">
            This account was created before Wealth details existed. Add its
            bank, identifiers and terms so you don’t have to keep them
            elsewhere.
          </p>
          <Button variant="outline" asChild>
            <Link href={base + "/edit"}>Add details</Link>
          </Button>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <p className="text-sm text-muted-foreground">{facts.valueLabel}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums [overflow-wrap:anywhere]">
            {facts.value}
          </p>
          {facts.extra && (
            <p
              className={cn(
                "mt-2 text-sm",
                facts.extra.tone === "up" && "text-up",
                facts.extra.tone === "down" && "text-down",
                !facts.extra.tone && "text-muted-foreground",
              )}
            >
              {facts.extra.label}: {facts.extra.value}
            </p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Tracked since {formatDate(holding.openedAt)} · ledger balance{" "}
            {rupeesNumber(minorToNumber(holding.balanceMinor))}
          </p>
        </Card>
        <Card className="lg:col-span-2">
          {deposit ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap justify-between gap-3 text-sm">
                <span>
                  <span className="text-muted-foreground">Start</span>{" "}
                  <strong>{formatDate(start) ?? "Not set"}</strong>
                </span>
                <span>
                  <span className="text-muted-foreground">Tenure</span>{" "}
                  <strong>{tenureLabel(d) ?? "Not set"}</strong>
                </span>
                <span>
                  <span className="text-muted-foreground">Matures</span>{" "}
                  <strong>{formatDate(maturity) ?? "Not set"}</strong>
                </span>
              </div>
              {progress !== undefined && (
                <div
                  className="progress"
                  role="progressbar"
                  aria-label="Time to maturity"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <span style={{ width: `${progress * 100}%` }} />
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {daysLeft === undefined
                  ? "Add a start date and tenure to track maturity."
                  : daysLeft > 0
                    ? `${daysLeft} days to maturity.`
                    : "Matured — record the payout from Cashflow when it reaches your bank."}
                {d.interestRate ? ` Rate ${d.interestRate}% p.a.` : ""}
                {estimate && !d.maturityAmount
                  ? ` Estimated maturity ${rupeesNumber(Math.round(estimate.maturity))} (${rupeesNumber(Math.round(estimate.interest))} interest).`
                  : ""}
              </p>
            </div>
          ) : (
            <dl className="fact-grid">
              <div>
                <dt>{c.institutionLabel}</dt>
                <dd className="flex items-center gap-2">
                  {holding.institution ? (
                    <>
                      {showsInstitutionLogo(c) && (
                        <InstitutionLogo
                          name={holding.institution}
                          institutionKey={holding.institutionKey}
                          icon={c.icon}
                          kinds={c.institutionKinds}
                          size={22}
                        />
                      )}
                      {holding.institution}
                    </>
                  ) : (
                    "Not set"
                  )}
                </dd>
              </div>
              {c.platformLabel && (
                <div>
                  <dt>{c.platformLabel}</dt>
                  <dd className="flex items-center gap-2">
                    {holding.platform ? (
                      <>
                        <InstitutionLogo
                          name={holding.platform}
                          institutionKey={holding.platformKey}
                          icon="sparkles"
                          kinds={c.platformKinds ?? []}
                          size={22}
                        />
                        {holding.platform}
                      </>
                    ) : (
                      "Not set"
                    )}
                  </dd>
                </div>
              )}
              <div>
                <dt>Opened</dt>
                <dd>
                  {formatDate(
                    d.openedOn ??
                      d.startDate ??
                      d.purchaseDate ??
                      holding.openedAt,
                  )}
                </dd>
              </div>
            </dl>
          )}
          {(c.fundingLabel || deposit) && (
            <p className="mt-4 border-t border-border pt-4 text-sm">
              <span className="text-muted-foreground">
                {c.fundingLabel ?? "Funded from"}:
              </span>{" "}
              {holding.fundingAccountName ? (
                <strong>{holding.fundingAccountName}</strong>
              ) : (
                "Not recorded"
              )}
              {holding.platform && deposit ? (
                <>
                  {" "}
                  <span className="text-muted-foreground">via</span>{" "}
                  <strong>{holding.platform}</strong>
                </>
              ) : null}
              {holding.institution && deposit ? (
                <>
                  {" "}
                  <span className="text-muted-foreground">to</span>{" "}
                  <strong>{holding.institution}</strong>
                </>
              ) : null}
            </p>
          )}
        </Card>
      </div>

      {groups.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.id}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{groupTitles[g.id]}</h2>
                {g.rows.some((f) => f.secret) && hasSecrets && (
                  <Button
                    variant="ghost"
                    onClick={reveal}
                    aria-pressed={showSecrets}
                    disabled={holding.secretsLocked}
                  >
                    {showSecrets ? (
                      <EyeOff aria-hidden="true" />
                    ) : (
                      <Eye aria-hidden="true" />
                    )}
                    {showSecrets ? "Hide" : "Reveal"}
                  </Button>
                )}
              </div>
              <dl className="fact-grid mt-4">
                {g.rows.map((f) => {
                  const value = f.secret
                    ? showSecrets && revealed?.[f.key]
                      ? revealed[f.key]!
                      : holding.secretMasks[f.key]!
                    : display(f, d[f.key]!);
                  return (
                    <div key={f.key}>
                      <dt className="flex items-center gap-1.5">
                        {f.secret && (
                          <LockKeyhole size={12} aria-label="Encrypted" />
                        )}
                        {f.label}
                      </dt>
                      <dd className="flex items-center gap-2 break-all">
                        <span className={f.secret ? "font-mono" : undefined}>
                          {value}
                        </span>
                        {f.secret && showSecrets && revealed?.[f.key] && (
                          <button
                            type="button"
                            className="text-muted-foreground"
                            aria-label={`Copy ${f.label}`}
                            onClick={() =>
                              navigator.clipboard?.writeText(revealed[f.key]!)
                            }
                          >
                            <Copy size={14} aria-hidden="true" />
                          </button>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </Card>
          ))}
        </div>
      )}
      {holding.secretsLocked && (
        <p className="text-sm text-muted-foreground">
          Encrypted identifiers exist but can’t be opened without the configured
          vault key.
        </p>
      )}
      {holding.notes && (
        <Card>
          <h2 className="text-lg font-semibold">Notes</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm">{holding.notes}</p>
        </Card>
      )}

      <Card className="grid gap-4">
        <h2 className="text-lg font-semibold">Manage</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <Link href={`/accounts/${holding.id}`}>
              <History aria-hidden="true" />
              Ledger history &amp; corrections
            </Link>
          </Button>
          {deposit && (
            <Button variant="outline" asChild>
              <Link href="/transactions">Record FD payout or top-up</Link>
            </Button>
          )}
          <Button variant="outline" onClick={toggleArchive} disabled={busy}>
            {holding.archived ? (
              <RotateCcw aria-hidden="true" />
            ) : (
              <Archive aria-hidden="true" />
            )}
            {holding.archived
              ? "Restore"
              : confirmArchive
                ? "Confirm archive"
                : "Archive"}
          </Button>
          {confirmArchive && (
            <Button variant="ghost" onClick={() => setConfirmArchive(false)}>
              Keep it
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Ledger entries are never deleted. Archiving hides this holding from
          lists (it still counts toward net worth) and keeps its history;
          restore it any time. Opening values are fixed through corrections in
          the ledger history.
          {holding.updatedAt
            ? ` Details last updated ${formatDate(holding.updatedAt)}.`
            : ""}
        </p>
      </Card>
    </div>
  );
}
