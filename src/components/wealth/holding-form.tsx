"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Info, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { parseAmount } from "@/lib/ledger/money";
import {
  categoryHref,
  findCategory,
  type CategoryDef,
  type FieldDef,
} from "@/lib/wealth/catalog";
import { addTenure, depositMaturityEstimate } from "@/lib/wealth/compute";
import {
  validateField,
  validateProfile,
  type ProfileInput,
} from "@/lib/wealth/contract";
import { institutions } from "@/lib/wealth/institutions";
import type { Holding } from "@/lib/wealth/types";
import { cn } from "@/lib/utils";
import {
  ensureWorkspace,
  formatDate,
  indiaToday,
  RequestError,
  rupees,
  rupeesNumber,
  send,
  useWealth,
} from "./client";
import { InstitutionLogo, resolveInstitution } from "./institution-logo";

const field = "grid gap-2 text-sm font-medium";
const select =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-base";
const groups: { id: FieldDef["group"]; title: string; hint?: string }[] = [
  { id: "identity", title: "Identification" },
  { id: "terms", title: "Terms" },
  { id: "position", title: "Holdings & value" },
  {
    id: "access",
    title: "Access & contact",
    hint: "Identifiers marked with a lock are encrypted at rest and masked everywhere. Never enter passwords, PINs, CVVs or OTPs.",
  },
  { id: "other", title: "Other" },
];

/** Accepts "5,00,000", "500000.5", "-1200" → canonical signed string. */
function normaliseAmount(value: string) {
  const v = value.replaceAll(",", "").replaceAll(" ", "").trim();
  const negative = v.startsWith("-");
  const body = negative ? v.slice(1) : v;
  const minor = parseAmount(body.replace(/^0+(?=\d)/, ""), "INR");
  return {
    text: (negative && minor ? "-" : "") + body.replace(/^0+(?=\d)/, ""),
    minor: negative ? -minor : minor,
  };
}

function dateKeyOf(c: CategoryDef) {
  return ["startDate", "openedOn", "purchaseDate"].find((k) =>
    c.fields.some((f) => f.key === k),
  );
}

function FieldInput({
  def,
  value,
  onChange,
  error,
  mask,
  cleared,
  onClear,
  disabled,
  placeholder,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  mask?: string;
  cleared?: boolean;
  onClear?: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const id = `field-${def.key}`;
  const described = [error && id + "-error", def.help && id + "-help"]
    .filter(Boolean)
    .join(" ");
  const common = {
    id,
    disabled,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": described || undefined,
  } as const;
  return (
    <div className={cn(field, def.type === "textarea" && "sm:col-span-2")}>
      <label htmlFor={id} className="flex items-center gap-1.5">
        {def.secret && (
          <LockKeyhole
            size={13}
            aria-label="Encrypted"
            className="text-primary"
          />
        )}
        {def.label}
      </label>
      {def.type === "select" ? (
        <select
          {...common}
          className={select}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Not set</option>
          {def.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : def.type === "textarea" ? (
        <textarea
          {...common}
          className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
          maxLength={def.max ?? 2000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          {...common}
          type={def.type === "date" ? "date" : "text"}
          inputMode={
            ["money", "number", "percent"].includes(def.type)
              ? "decimal"
              : undefined
          }
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={
            placeholder ??
            (mask && !cleared
              ? `${mask} — leave blank to keep`
              : def.placeholder)
          }
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {def.secret && mask && onClear && !cleared && (
        <button
          type="button"
          className="justify-self-start text-xs font-normal text-muted-foreground underline"
          onClick={onClear}
        >
          Remove saved {def.label.toLowerCase()}
        </button>
      )}
      {cleared && (
        <span className="text-xs font-normal text-muted-foreground">
          Will be removed when you save.
        </span>
      )}
      {def.help && (
        <span
          id={id + "-help"}
          className="text-xs font-normal text-muted-foreground"
        >
          {def.help}
        </span>
      )}
      {error && (
        <span
          id={id + "-error"}
          className="text-xs font-normal text-destructive"
        >
          {error}
        </span>
      )}
    </div>
  );
}

export function HoldingForm({
  categoryId,
  holdingId,
}: {
  categoryId: string;
  holdingId?: string;
}) {
  const router = useRouter();
  const { data, error: loadError, reload } = useWealth();
  const category = findCategory(categoryId)!;
  const editing = !!holdingId;
  const holding: Holding | undefined = holdingId
    ? data?.holdings.find((h) => h.id === holdingId)
    : undefined;
  const dateKey = dateKeyOf(category);
  const deposit = category.ledgerKind === "FIXED_DEPOSIT";

  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [platform, setPlatform] = useState("");
  const [funding, setFunding] = useState("");
  const [amount, setAmount] = useState("");
  const [openedOn, setOpenedOn] = useState(indiaToday());
  const [mode, setMode] = useState<"opening" | "transfer">("opening");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [cleared, setCleared] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const loaded = useRef(false);
  const pending = useRef<{
    workspace?: string;
    accountId?: string;
    accountKey: string;
    fundingKey: string;
    renameKey: string;
    fundingDone: boolean;
    uncertain: boolean;
  }>({
    accountKey: crypto.randomUUID(),
    fundingKey: crypto.randomUUID(),
    renameKey: crypto.randomUUID(),
    fundingDone: false,
    uncertain: false,
  });

  useEffect(() => {
    if (!holding || loaded.current) return;
    loaded.current = true;
    setName(holding.name);
    setInstitution(holding.institution ?? "");
    setPlatform(holding.platform ?? "");
    setFunding(holding.fundingAccountId ?? "");
    setDetails(holding.details);
    setNotes(holding.notes ?? "");
  }, [holding]);

  const workspaceId =
    holding?.workspaceId ??
    pending.current.workspace ??
    data?.workspaces[0]?.id;
  const fundingOptions = (data?.holdings ?? []).filter(
    (h) =>
      (h.kind === "BANK" || h.kind === "CASH") &&
      h.type === "ASSET" &&
      h.id !== holdingId &&
      (!h.archived || h.id === holding?.fundingAccountId) &&
      (!workspaceId || h.workspaceId === workspaceId),
  );
  const institutionMatch = resolveInstitution(institution);
  const platformMatch = resolveInstitution(platform);
  const suggestedName = useMemo(() => {
    const who = institutionMatch?.name ?? institution.trim();
    return who ? `${who} ${category.singular}`.slice(0, 80) : category.singular;
  }, [institutionMatch, institution, category]);
  const ledgerLocked = !!pending.current.accountId || pending.current.uncertain;

  const amountMinor = (() => {
    try {
      return amount.trim() ? normaliseAmount(amount).minor : undefined;
    } catch {
      return undefined;
    }
  })();
  const principalRupees = editing
    ? holding
      ? Number(BigInt(holding.balanceMinor)) / 100
      : 0
    : amountMinor !== undefined
      ? Number(amountMinor) / 100
      : 0;
  const effectiveDetails = {
    ...details,
    ...(!editing && dateKey ? { [dateKey]: openedOn } : {}),
  };
  const derivedMaturity = deposit
    ? addTenure(
        effectiveDetails.startDate,
        details.tenureYears,
        details.tenureMonths,
        details.tenureDays,
      )
    : undefined;
  const estimate = deposit
    ? depositMaturityEstimate(principalRupees, effectiveDetails)
    : undefined;

  function setDetail(key: string, value: string) {
    setDetails((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  function buildProfile(): ProfileInput {
    const secretInput: Record<string, string> = {};
    for (const [k, v] of Object.entries(secrets))
      if (v.trim()) secretInput[k] = v;
    for (const k of cleared) if (!secretInput[k]) secretInput[k] = "";
    const detailInput: Record<string, string> = {};
    for (const [k, v] of Object.entries(effectiveDetails))
      if (v?.trim()) detailInput[k] = v;
    return {
      category: category.id,
      institution: institution.trim() || null,
      institutionKey: institutionMatch?.key ?? null,
      platform: category.platformLabel ? platform.trim() || null : null,
      platformKey: category.platformLabel ? (platformMatch?.key ?? null) : null,
      fundingAccountId: category.fundingLabel ? funding || null : null,
      details: detailInput,
      ...(Object.keys(secretInput).length ? { secrets: secretInput } : {}),
      notes: notes.trim() || null,
      revision: editing ? (holding?.revision ?? null) : null,
    };
  }

  function check() {
    const problems: Record<string, string> = {};
    const finalName = (name.trim() || suggestedName).trim();
    if (finalName.length > 80) problems.name = "Use 80 characters or fewer.";
    if (!editing) {
      if (!ledgerLocked) {
        if (amountMinor === undefined)
          problems.amount = "Enter an amount like 500000 or 5,00,000.50.";
        else if (mode === "transfer" && amountMinor <= 0n)
          problems.amount = "Enter a positive principal to transfer.";
        if (!openedOn) problems.openedOn = "Choose a date.";
      }
      if (mode === "transfer" && !funding)
        problems.fundingAccountId = "Choose the account the money came from.";
    }
    const profile = buildProfile();
    const result = validateProfile(profile, category.ledgerKind);
    if (!result.ok) Object.assign(problems, result.errors);
    return { problems, finalName, profile };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBanner("");
    const { problems, finalName, profile } = check();
    setErrors(problems);
    if (Object.values(problems).some(Boolean)) {
      setBanner("Some details need attention.");
      const first = Object.keys(problems)[0];
      document
        .getElementById(
          first === "amount" ||
            first === "name" ||
            first === "openedOn" ||
            first === "fundingAccountId" ||
            first === "institution" ||
            first === "platform"
            ? `input-${first}`
            : `field-${first}`,
        )
        ?.focus();
      return;
    }
    setBusy(true);
    const p = pending.current;
    try {
      if (!editing) {
        p.workspace ??= await ensureWorkspace(data?.workspaces[0]?.id);
        const effectiveAt = openedOn + "T00:00:00+05:30";
        const transfer =
          deposit && category.ledgerFunding && mode === "transfer";
        if (!p.accountId) {
          setStep("Creating the ledger account…");
          try {
            const created = await send<{ accountId: string }>(
              `/api/accounts?workspace=${p.workspace}`,
              "POST",
              {
                kind: "CREATE_ACCOUNT",
                name: finalName,
                accountKind: category.ledgerKind,
                opening: transfer ? "0" : normaliseAmount(amount).text,
                effectiveAt,
              },
              p.accountKey,
            );
            p.accountId = created.accountId;
            p.uncertain = false;
          } catch (e) {
            if (e instanceof RequestError && e.status >= 500)
              p.uncertain = true;
            else p.accountKey = crypto.randomUUID();
            throw e;
          }
        }
        if (transfer && !p.fundingDone) {
          setStep("Posting the transfer from your bank…");
          await send(
            `/api/transactions?workspace=${p.workspace}`,
            "POST",
            {
              kind: "FD_FUNDING",
              sourceAccountId: funding,
              destinationAccountId: p.accountId,
              amount: normaliseAmount(amount).text,
              effectiveAt,
              description: platform.trim()
                ? `${finalName} via ${platform.trim()}`.slice(0, 500)
                : finalName,
            },
            p.fundingKey,
          );
          p.fundingDone = true;
        }
        setStep("Saving details…");
        await send(`/api/wealth/holdings/${p.accountId}`, "PUT", profile);
        router.push(`${categoryHref(category)}/${p.accountId}?created=1`);
        return;
      }
      if (!holding) return;
      if (finalName !== holding.name) {
        setStep("Renaming…");
        await send(
          `/api/accounts?workspace=${holding.workspaceId}`,
          "POST",
          { kind: "RENAME_ACCOUNT", accountId: holding.id, name: finalName },
          p.renameKey,
        );
        p.renameKey = crypto.randomUUID();
      }
      setStep("Saving details…");
      await send(`/api/wealth/holdings/${holding.id}`, "PUT", profile);
      router.push(`${categoryHref(category)}/${holding.id}?saved=1`);
    } catch (e) {
      const err = e as RequestError;
      if (err.fields) setErrors(err.fields);
      setBanner(
        (err.message || "Please try again.") +
          (p.accountId && !editing
            ? " The account was created — submit again to finish the remaining steps."
            : ""),
      );
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  const back = holding
    ? `${categoryHref(category)}/${holding.id}`
    : categoryHref(category);

  if (!data)
    return loadError ? (
      <div role="alert" className="notice notice-error">
        <div>
          <strong>Couldn’t load</strong>
          <p>{loadError}</p>
          <Button variant="outline" className="mt-4" onClick={reload}>
            Try again
          </Button>
        </div>
      </div>
    ) : (
      <p role="status">Loading…</p>
    );
  if (editing && !holding)
    return (
      <Card>
        <h1 className="text-xl font-semibold">Holding unavailable</h1>
        <Link
          href={categoryHref(category)}
          className="mt-4 inline-block underline"
        >
          Back to {category.label.toLowerCase()}
        </Link>
      </Card>
    );

  const grouped = groups
    .map((g) => ({
      ...g,
      fields: category.fields.filter(
        (f) => f.group === g.id && (editing || f.key !== dateKey),
      ),
    }))
    .filter((g) => g.fields.length);

  return (
    <div className="grid gap-6">
      <Link
        href={back}
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {holding ? holding.name : category.label}
      </Link>
      <div className="flex items-start gap-4">
        <InstitutionLogo
          name={institution || name}
          institutionKey={institutionMatch?.key}
          icon={category.icon}
          size={52}
        />
        <div>
          <p className="eyebrow">
            {editing
              ? "EDIT DETAILS"
              : "NEW " + category.singular.toUpperCase()}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {editing ? holding!.name : `Add ${category.singular.toLowerCase()}`}
          </h1>
          <p className="page-description">
            {editing
              ? "Update anything you’ve learned since. Balances change through ledger entries."
              : "Fill in what you know now — every detail except the opening value stays editable later."}
          </p>
        </div>
      </div>
      {banner && (
        <div
          role="alert"
          className="rounded-xl border border-destructive p-4 text-sm"
        >
          {banner}
        </div>
      )}
      {editing &&
        data.vault === false &&
        category.fields.some((f) => f.secret) && (
          <p className="notice">
            <Info aria-hidden="true" />
            <span>
              Encrypted identifiers are unavailable because{" "}
              <code>LEDGERONE_VAULT_KEY</code> isn’t configured.
            </span>
          </p>
        )}
      <form
        onSubmit={submit}
        noValidate
        className="grid gap-6"
        aria-label={editing ? "Edit holding" : "Add holding"}
      >
        <Card className="grid gap-5">
          <h2 className="text-lg font-semibold">Where it’s held</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className={field}>
              <label htmlFor="input-institution">
                {category.institutionLabel}
              </label>
              <div className="flex items-center gap-3">
                <InstitutionLogo
                  name={institution}
                  institutionKey={institutionMatch?.key}
                  icon={category.icon}
                  size={40}
                />
                <Input
                  id="input-institution"
                  list="institution-options"
                  maxLength={120}
                  autoComplete="off"
                  placeholder={category.institutionHint}
                  value={institution}
                  aria-invalid={errors.institution ? true : undefined}
                  onChange={(e) => setInstitution(e.target.value)}
                />
              </div>
              {institutionMatch && (
                <span className="text-xs font-normal text-muted-foreground">
                  Recognised: {institutionMatch.name}
                </span>
              )}
              {errors.institution && (
                <span className="text-xs font-normal text-destructive">
                  {errors.institution}
                </span>
              )}
            </div>
            {category.platformLabel && (
              <div className={field}>
                <label htmlFor="input-platform">{category.platformLabel}</label>
                <div className="flex items-center gap-3">
                  <InstitutionLogo
                    name={platform}
                    institutionKey={platformMatch?.key}
                    icon="sparkles"
                    size={40}
                  />
                  <Input
                    id="input-platform"
                    list="institution-options"
                    maxLength={120}
                    autoComplete="off"
                    placeholder="Stable Money, Zerodha, Groww… or Direct"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  />
                </div>
                {platformMatch && (
                  <span className="text-xs font-normal text-muted-foreground">
                    Recognised: {platformMatch.name}
                  </span>
                )}
              </div>
            )}
            <div className={field}>
              <label htmlFor="input-name">Display name</label>
              <Input
                id="input-name"
                maxLength={80}
                value={name}
                placeholder={suggestedName}
                aria-invalid={errors.name ? true : undefined}
                onChange={(e) => setName(e.target.value)}
              />
              <span className="text-xs font-normal text-muted-foreground">
                Leave blank to use “{suggestedName}”.
              </span>
              {errors.name && (
                <span className="text-xs font-normal text-destructive">
                  {errors.name}
                </span>
              )}
            </div>
            {category.fundingLabel && (
              <div className={field}>
                <label htmlFor="input-fundingAccountId">
                  {category.fundingLabel}
                </label>
                <select
                  id="input-fundingAccountId"
                  className={select}
                  value={funding}
                  aria-invalid={errors.fundingAccountId ? true : undefined}
                  onChange={(e) => setFunding(e.target.value)}
                >
                  <option value="">Not recorded</option>
                  {fundingOptions.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                      {h.archived ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
                {!fundingOptions.length && (
                  <span className="text-xs font-normal text-muted-foreground">
                    Add a{" "}
                    <Link
                      href="/wealth/liquid/savings/new"
                      className="underline"
                    >
                      bank account
                    </Link>{" "}
                    first to link where the money came from.
                  </span>
                )}
                {errors.fundingAccountId && (
                  <span className="text-xs font-normal text-destructive">
                    {errors.fundingAccountId}
                  </span>
                )}
              </div>
            )}
          </div>
          <datalist id="institution-options">
            {institutions.map((i) => (
              <option key={i.key} value={i.name} />
            ))}
          </datalist>
        </Card>

        {!editing && (
          <Card className="grid gap-5">
            <h2 className="text-lg font-semibold">
              {deposit ? "How it was opened" : "Opening value"}
            </h2>
            {deposit && category.ledgerFunding && (
              <fieldset className="grid gap-3" disabled={ledgerLocked}>
                <legend className="sr-only">How was it opened?</legend>
                {(
                  [
                    [
                      "opening",
                      "Already open — record as an opening balance",
                      "Use this for deposits made before you started tracking here.",
                    ],
                    [
                      "transfer",
                      "Paid from one of my accounts",
                      "Posts a transfer from the funding account to this FD on the start date.",
                    ],
                  ] as const
                ).map(([value, title, hint]) => (
                  <label
                    key={value}
                    className={cn(
                      "choice-tile",
                      mode === value && "choice-tile-active",
                    )}
                  >
                    <input
                      type="radio"
                      name="opening-mode"
                      value={value}
                      checked={mode === value}
                      onChange={() => setMode(value)}
                    />
                    <span>
                      <strong>{title}</strong>
                      <small>{hint}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <div className={field}>
                <label htmlFor="input-amount">
                  {category.openingLabel} (₹)
                </label>
                <Input
                  id="input-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="5,00,000"
                  value={amount}
                  disabled={ledgerLocked}
                  aria-invalid={errors.amount ? true : undefined}
                  aria-describedby="amount-help"
                  onChange={(e) => setAmount(e.target.value)}
                />
                <span
                  id="amount-help"
                  className="text-xs font-normal text-muted-foreground"
                >
                  {category.openingHelp}
                  {amountMinor !== undefined && amountMinor !== 0n
                    ? ` · ${rupees(amountMinor)}`
                    : ""}
                </span>
                {errors.amount && (
                  <span className="text-xs font-normal text-destructive">
                    {errors.amount}
                  </span>
                )}
              </div>
              <div className={field}>
                <label htmlFor="input-openedOn">
                  {dateKey === "startDate"
                    ? "Start date"
                    : dateKey === "purchaseDate"
                      ? "Purchase date"
                      : "Opening date"}
                </label>
                <Input
                  id="input-openedOn"
                  type="date"
                  value={openedOn}
                  disabled={ledgerLocked}
                  onChange={(e) => setOpenedOn(e.target.value)}
                />
                <span className="text-xs font-normal text-muted-foreground">
                  The balance is recorded on this date (India time).
                </span>
              </div>
            </div>
            {ledgerLocked && (
              <p className="text-sm text-muted-foreground">
                The ledger account is already created; these values are locked
                so retries stay safe. Correct them later from the ledger
                history.
              </p>
            )}
          </Card>
        )}

        {grouped.map((g) => (
          <Card key={g.id} className="grid gap-5">
            <div>
              <h2 className="text-lg font-semibold">{g.title}</h2>
              {g.hint && (
                <p className="mt-1 text-sm text-muted-foreground">{g.hint}</p>
              )}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {g.fields.map((f) =>
                f.secret ? (
                  <FieldInput
                    key={f.key}
                    def={f}
                    value={secrets[f.key] ?? ""}
                    disabled={!data.vault}
                    placeholder={
                      !data.vault ? "Vault key not configured" : undefined
                    }
                    mask={holding?.secretMasks[f.key]}
                    cleared={cleared.includes(f.key)}
                    onClear={() => setCleared((c) => [...c, f.key])}
                    error={errors[f.key]}
                    onChange={(v) => {
                      setSecrets((s) => ({ ...s, [f.key]: v }));
                      setCleared((c) => c.filter((k) => k !== f.key));
                      setErrors((e) => ({
                        ...e,
                        [f.key]: validateField(f, v) ?? "",
                      }));
                    }}
                  />
                ) : (
                  <FieldInput
                    key={f.key}
                    def={f}
                    value={details[f.key] ?? ""}
                    error={errors[f.key]}
                    placeholder={
                      f.key === "maturityDate" && derivedMaturity
                        ? undefined
                        : f.key === "maturityAmount" && estimate
                          ? `≈ ${Math.round(estimate.maturity)}`
                          : undefined
                    }
                    onChange={(v) => setDetail(f.key, v)}
                  />
                ),
              )}
            </div>
            {g.id === "terms" && deposit && (estimate || derivedMaturity) && (
              <div className="estimate-panel" role="status">
                {derivedMaturity && !details.maturityDate && (
                  <p>
                    Matures on <strong>{formatDate(derivedMaturity)}</strong>{" "}
                    (from start date + tenure)
                  </p>
                )}
                {estimate && (
                  <p>
                    {estimate.payoutPerPeriod !== undefined ? (
                      <>
                        Pays about{" "}
                        <strong>
                          {rupeesNumber(Math.round(estimate.payoutPerPeriod))}
                        </strong>{" "}
                        per period ·{" "}
                        {rupeesNumber(Math.round(estimate.interest))} interest
                        in total
                      </>
                    ) : (
                      <>
                        Estimated maturity{" "}
                        <strong>
                          {rupeesNumber(Math.round(estimate.maturity))}
                        </strong>{" "}
                        · {rupeesNumber(Math.round(estimate.interest))} interest
                        over {estimate.days} days
                      </>
                    )}
                  </p>
                )}
              </div>
            )}
          </Card>
        ))}

        <Card className="grid gap-3">
          <label htmlFor="input-notes" className="text-lg font-semibold">
            Notes
          </label>
          <textarea
            id="input-notes"
            className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
            maxLength={2000}
            placeholder="Anything else worth remembering — branch contact, renewal plans, why you chose it…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Card>

        <div className="sticky-actions">
          <Button type="submit" disabled={busy}>
            {busy
              ? step || "Saving…"
              : editing
                ? "Save changes"
                : `Add ${category.singular.toLowerCase()}`}
          </Button>
          <Button variant="outline" asChild>
            <Link href={back}>Cancel</Link>
          </Button>
          {busy && (
            <span role="status" className="text-sm text-muted-foreground">
              {step}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
