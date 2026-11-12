import { inversePostings, instant, unavailable } from "./contract";
// R/C recover only immutable financial evidence; POST's existing DTO is unchanged.
export type JournalResult = Readonly<{
  journalId: string;
  effectiveAt: string;
  postedAt: string;
  description: string;
  legs: readonly {
    accountId: string;
    side: string;
    currency: string;
    nativeMinor: string;
    functionalMinor: string;
  }[];
}>;
export type ReverseResult = Readonly<{
  kind: "REVERSE";
  operationId: string;
  originalJournalId: string;
  reason: string;
  reversal: JournalResult;
}>;
export type CorrectResult = Readonly<{
  kind: "CORRECT";
  operationId: string;
  originalJournalId: string;
  reason: string;
  reversal: JournalResult;
  replacement: JournalResult;
}>;
export type StoredJournal = Omit<JournalResult, "legs"> &
  Readonly<{
    legs: readonly (JournalResult["legs"][number] & {
      fxRateId: string | null;
    })[];
    kind: string;
    status: string;
    operationId: string;
    ownerId: string;
    workspaceId: string;
    reversesJournalId: string | null;
  }>;
export function correctionResult(
  scope: Readonly<{
    ownerId: string;
    workspaceId: string;
    operationId: string;
  }>,
  kind: "REVERSE" | "CORRECT",
  originalJournalId: string,
  reason: string,
  rows: readonly StoredJournal[],
): ReverseResult | CorrectResult {
  if (
    rows.length !== (kind === "REVERSE" ? 1 : 2) ||
    rows.some(
      (j) =>
        j.operationId !== scope.operationId ||
        j.ownerId !== scope.ownerId ||
        j.workspaceId !== scope.workspaceId ||
        j.status !== "POSTED" ||
        j.journalId === originalJournalId,
    )
  )
    throw unavailable();
  const reversals = rows.filter(
    (j) => j.kind === "REVERSAL" && j.reversesJournalId === originalJournalId,
  );
  const replacements = rows.filter(
    (j) => j.kind === "GENERAL" && j.reversesJournalId === null,
  );
  if (
    reversals.length !== 1 ||
    replacements.length !== (kind === "CORRECT" ? 1 : 0) ||
    new Set(rows.map((j) => j.journalId)).size !== rows.length
  )
    throw unavailable();
  function financial(j: StoredJournal): JournalResult {
    // The persisted query supplies exact INR evidence. Repeat monetary checks
    // before forming JSON; never fabricate a result from incomplete children.
    inversePostings(j.legs);
    try {
      instant(j.effectiveAt);
      instant(j.postedAt);
    } catch {
      throw unavailable();
    }
    return {
      journalId: j.journalId,
      effectiveAt: j.effectiveAt,
      postedAt: j.postedAt,
      description: j.description,
      legs: j.legs.map((l) => ({
        accountId: l.accountId,
        side: l.side,
        currency: l.currency,
        nativeMinor: l.nativeMinor,
        functionalMinor: l.functionalMinor,
      })),
    };
  }
  const base = {
    operationId: scope.operationId,
    originalJournalId,
    reason,
    reversal: financial(reversals[0]!),
  };
  return kind === "REVERSE"
    ? { kind, ...base }
    : { kind, ...base, replacement: financial(replacements[0]!) };
}
