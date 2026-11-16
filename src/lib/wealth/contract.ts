// Client-safe holding profile contract. The same validator runs in the browser
// (inline errors) and on the server (authoritative), so they cannot drift.
import { z } from "zod";
import { findCategory, type CategoryDef, type FieldDef } from "./catalog";
import { institutionByKey } from "./institutions";

export const PROFILE_TEXT_MAX = 120;
export const NOTES_MAX = 2000;

export type ProfileInput = {
  category: string;
  institution: string | null;
  institutionKey: string | null;
  platform: string | null;
  platformKey: string | null;
  fundingAccountId: string | null;
  details: Record<string, string>;
  /** Omitted → keep stored secrets. A key set to "" removes that secret. */
  secrets?: Record<string, string>;
  notes: string | null;
  /** Current revision for updates (optimistic concurrency); null on first save. */
  revision: number | null;
};

const shape = z
  .object({
    category: z.string().max(40),
    institution: z.string().max(PROFILE_TEXT_MAX).nullable(),
    institutionKey: z.string().max(40).nullable(),
    platform: z.string().max(PROFILE_TEXT_MAX).nullable(),
    platformKey: z.string().max(40).nullable(),
    fundingAccountId: z.uuid().nullable(),
    details: z.record(z.string().max(40), z.string().max(2000)),
    secrets: z.record(z.string().max(40), z.string().max(200)).optional(),
    notes: z.string().max(NOTES_MAX).nullable(),
    revision: z.number().int().min(1).max(2147483647).nullable(),
  })
  .strict();

const clean = (s: string | null | undefined) => {
  const v = (s ?? "").trim();
  return v && !v.includes("\0") ? v : null;
};

export function validateField(field: FieldDef, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.includes("\0")) return "Remove unsupported characters.";
  switch (field.type) {
    case "money":
      return /^\d{1,13}(\.\d{1,2})?$/.test(value.replaceAll(",", ""))
        ? null
        : "Enter an amount with up to 2 decimals.";
    case "number":
      return /^\d{1,12}(\.\d{1,6})?$/.test(value)
        ? null
        : "Enter a positive number.";
    case "percent":
      return /^\d{1,2}(\.\d{1,4})?$/.test(value)
        ? null
        : "Enter a rate like 7.1 (0–99.99).";
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter a valid date.";
      const d = new Date(value + "T00:00:00Z");
      return Number.isFinite(d.getTime()) &&
        d.toISOString().slice(0, 10) === value
        ? null
        : "Enter a valid date.";
    }
    case "select":
      return field.options?.some((o) => o.value === value)
        ? null
        : "Choose one of the options.";
    case "textarea":
      return value.length <= (field.max ?? NOTES_MAX)
        ? null
        : `Use ${field.max ?? NOTES_MAX} characters or fewer.`;
    default: {
      const max = field.max ?? PROFILE_TEXT_MAX;
      if (value.length > max) return `Use ${max} characters or fewer.`;
      if (field.pattern && !new RegExp(field.pattern).test(value))
        return field.patternHint ?? "Check the format.";
      return null;
    }
  }
}

function normalise(field: FieldDef, value: string) {
  const v = value.trim();
  if (field.type === "money") return v.replaceAll(",", "");
  if (field.key === "ifsc" || field.key === "isin") return v.toUpperCase();
  return v;
}

export type ProfileValidation =
  | { ok: true; value: ProfileInput; category: CategoryDef }
  | { ok: false; errors: Record<string, string> };

/** Validates a profile for a ledger account kind. Unknown keys are rejected. */
export function validateProfile(
  input: unknown,
  ledgerKind: string,
): ProfileValidation {
  const parsed = shape.safeParse(input);
  if (!parsed.success)
    return { ok: false, errors: { form: "Check the details and try again." } };
  const data = parsed.data;
  const category = findCategory(data.category);
  if (!category || category.ledgerKind !== ledgerKind)
    return {
      ok: false,
      errors: { category: "This type does not match the account." },
    };
  const errors: Record<string, string> = {};
  const details: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  const fields = new Map(category.fields.map((f) => [f.key, f]));
  for (const [key, raw] of Object.entries(data.details)) {
    const field = fields.get(key);
    if (!field || field.secret) {
      errors[key] = "Unsupported field.";
      continue;
    }
    const problem = validateField(field, raw);
    if (problem) errors[key] = problem;
    else if (raw.trim()) details[key] = normalise(field, raw);
  }
  if (data.secrets)
    for (const [key, raw] of Object.entries(data.secrets)) {
      const field = fields.get(key);
      if (!field?.secret) {
        errors[key] = "Unsupported field.";
        continue;
      }
      const problem = validateField(field, raw);
      if (problem) errors[key] = problem;
      else secrets[key] = raw.trim() ? normalise(field, raw) : "";
    }
  for (const [key, label] of [
    ["institution", data.institution],
    ["platform", data.platform],
    ["notes", data.notes],
  ] as const)
    if (label?.includes("\0")) errors[key] = "Remove unsupported characters.";
  if (data.institutionKey) {
    const known = institutionByKey(data.institutionKey);
    if (!known) errors.institution = "Unknown institution.";
    else if (!category.institutionKinds.includes(known.kind))
      errors.institution = `${known.name} isn’t a valid ${category.institutionLabel.toLowerCase()} for this type.`;
  }
  if (data.platformKey) {
    const known = institutionByKey(data.platformKey);
    if (!known) errors.platform = "Unknown platform.";
    else if (!category.platformKinds?.includes(known.kind))
      errors.platform = `${known.name} isn’t a valid app or platform for this type.`;
  }
  if (!category.platformLabel && clean(data.platform))
    errors.platform = "This type has no platform.";
  if (!category.fundingLabel && data.fundingAccountId)
    errors.fundingAccountId = "This type has no funding account.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    category,
    value: {
      category: category.id,
      institution: clean(data.institution),
      institutionKey: clean(data.institution) ? data.institutionKey : null,
      platform: clean(data.platform),
      platformKey: clean(data.platform) ? data.platformKey : null,
      fundingAccountId: data.fundingAccountId,
      details,
      ...(data.secrets ? { secrets } : {}),
      notes: clean(data.notes),
      revision: data.revision,
    },
  };
}

/** Shows only the tail of a stored identifier, e.g. "•••• 4567". */
export function maskSecret(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= 4) return "••••";
  return "•••• " + compact.slice(-4);
}
