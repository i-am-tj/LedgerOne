import "server-only";
import { z } from "zod";

// Evidence policy only: no connection, financial capability or activation path.
// Artifact contents are review inputs, not cryptographic proof of test execution.
export const gateRequirements = {
  W01: ["session-actor", "two-user-http", "retry-revocation", "cross-origin"],
  W02: ["exact-money", "bounded-stream", "strict-internal-fields"],
  W03: [
    "canonical-conflict",
    "same-key-race",
    "immutable-replay",
    "semantic-binding",
  ],
  W04: ["post-atomicity", "private-draft-isolation", "deferred-rollback"],
  W05: ["exact-inverse-multiset", "exact-original", "reversal-contention"],
  W06: ["correct-original", "same-operation-denial", "cross-period-dates"],
  W07: [
    "audit-identity",
    "audit-immutable",
    "audit-rollback",
    "legacy-compatible",
  ],
  W08: ["private-drafts-only", "persisted-draft-denial"],
  W09: ["lock-order", "real-40001", "real-40P01", "cancel", "uncertain-commit"],
  W10: ["catalog-drift", "schema-resolution", "unavailable-denial"],
  W11: ["fresh-upgrade", "migration-checksums", "history-denial"],
  W12: ["A05-01", "A05-02", "A05-03", "A05-04", "A05-05", "scope-review"],
  W13: [
    "actual-roles",
    "role-inheritance",
    "public-shadowing",
    "native-disabled",
  ],
  W14: [
    "full-pipeline",
    "staged-capacity",
    "critical-p99",
    "maximum-stress",
    "inr-only",
  ],
  W15: [
    "independent-review",
    "current-head-ci",
    "reviewed-merge",
    "activation-separate",
  ],
} as const;
export type GateId = keyof typeof gateRequirements;
export const gateIds = Object.keys(gateRequirements) as GateId[];
export const evidenceProfiles = [
  "local-public",
  "local-private",
  "hosted-isolated",
] as const;
export type EvidenceProfile = (typeof evidenceProfiles)[number];
export const excludedCapabilities = [
  "consumer-raw-posting",
  "consumer-business-templates",
  "persisted-editable-drafts",
  "account-lifecycle-original-labels",
  "opening-account-correction-reconciliation",
  "foreign-currency-posting",
  "production-activation",
] as const;
export const findingOwners = {
  "A05-01": ["P1-S06D"],
  "A05-02": ["P1-S06D"],
  "A05-03": ["P1-S06D"],
  "A05-04": ["P1-S06D", "P1-S07"],
  "A05-05": ["P1-S06D", "P1-S07"],
} as const;
const token = z.string().regex(/^[A-Za-z0-9_./:#-]{1,240}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const evidenceBindingSchema = z.strictObject({
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  targetId: token,
  schema: z.enum(["public", "ledgerone"]),
  postgresVersion: z.string().regex(/^17\.[0-9]+$/),
  connectionMode: z.enum(["direct", "session", "transaction"]),
  migrationDigest: digest,
  catalogDigest: digest,
  roleDigest: digest,
});
export type EvidenceBinding = z.infer<typeof evidenceBindingSchema>;
const resultSchema = z.enum(["PASS", "FAIL", "NOT_RUN", "NOT_PROVEN"]);
export type EvidenceResult = z.infer<typeof resultSchema>;
const checkSchema = z.strictObject({
  id: z.enum(gateIds as [GateId, ...GateId[]]),
  result: resultSchema,
  assertions: z.array(token).max(100),
  artifact: token,
  command: z.string().trim().min(1).max(300),
});
const profileSchema = z.strictObject({
  profile: z.enum(evidenceProfiles),
  binding: evidenceBindingSchema,
  checks: z.array(checkSchema).max(15),
});
const bundleSchema = z.array(profileSchema).max(3);
export type ProfileEvidence = z.infer<typeof profileSchema>;
export type EvidenceBundle = z.infer<typeof bundleSchema>;
export type GateContext = Partial<Record<EvidenceProfile, EvidenceBinding>>;
export type Checkpoint = Readonly<{
  result: "PASS" | "FAIL" | "NOT_RUN";
  missing: readonly string[];
}>;
const closed = {
  financialWritesEnabled: false,
  productionAuthorized: false,
  consumerRawPostingEnabled: false,
} as const;

export function evaluateGateEvidence(input: unknown, expected: GateContext) {
  const parsed = bundleSchema.safeParse(input);
  const failed = (reason: string): Checkpoint => ({
    result: "FAIL",
    missing: [reason],
  });
  const invalid = () => ({
    ...closed,
    localReadiness: failed("evidence:invalid"),
    hostedVerification: failed("evidence:invalid"),
    releaseReview: failed("evidence:invalid"),
    overall: "FAIL" as const,
  });
  if (!parsed.success) return invalid();
  const seen = new Set<EvidenceProfile>();
  for (const profile of parsed.data) {
    if (seen.has(profile.profile)) return invalid();
    seen.add(profile.profile);
    const ids = new Set<GateId>();
    for (const check of profile.checks) {
      if (ids.has(check.id)) return invalid();
      ids.add(check.id);
      if (new Set(check.assertions).size !== check.assertions.length)
        return invalid();
      if (
        check.assertions.some(
          (a) => !(gateRequirements[check.id] as readonly string[]).includes(a),
        )
      )
        return invalid();
    }
  }
  function checkpoint(
    profiles: readonly EvidenceProfile[],
    required: readonly GateId[],
  ): Checkpoint {
    const missing: string[] = [];
    let supplied = false;
    for (const profile of profiles) {
      const evidence = parsed.data!.find((r) => r.profile === profile);
      if (!evidence) {
        missing.push(`${profile}:missing`);
        continue;
      }
      supplied = true;
      const baseline = evidenceBindingSchema.safeParse(expected[profile]);
      if (
        !baseline.success ||
        (profile === "local-public"
          ? evidence.binding.schema !== "public"
          : evidence.binding.schema !== "ledgerone") ||
        Object.keys(evidence.binding).some(
          (k) =>
            evidence.binding[k as keyof EvidenceBinding] !==
            baseline.data[k as keyof EvidenceBinding],
        )
      ) {
        missing.push(`${profile}:binding`);
        continue;
      }
      for (const id of required) {
        const check = evidence.checks.find((c) => c.id === id);
        if (
          !check ||
          check.result !== "PASS" ||
          gateRequirements[id].some(
            (assertion) => !check.assertions.includes(assertion),
          )
        )
          missing.push(`${profile}:${id}`);
      }
    }
    return {
      result: missing.length ? (supplied ? "FAIL" : "NOT_RUN") : "PASS",
      missing,
    };
  }
  const technicalRows = gateIds.filter((id) => id !== "W15");
  const localReadiness = checkpoint(
    ["local-public", "local-private"],
    technicalRows,
  );
  const hostedVerification = checkpoint(["hosted-isolated"], technicalRows);
  const releaseReview = checkpoint(evidenceProfiles, ["W15"]);
  return {
    ...closed,
    localReadiness,
    hostedVerification,
    releaseReview,
    overall:
      localReadiness.result === "PASS" &&
      hostedVerification.result === "PASS" &&
      releaseReview.result === "PASS"
        ? ("PASS" as const)
        : ("FAIL" as const),
  };
}
