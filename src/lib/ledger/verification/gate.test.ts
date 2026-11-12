import { expect, it } from "vitest";
import {
  evaluateGateEvidence,
  gateIds,
  gateRequirements,
  findingOwners,
  type EvidenceBinding,
  type EvidenceBundle,
  type EvidenceProfile,
} from "./gate";
const binding = (profile: EvidenceProfile): EvidenceBinding => ({
  sourceCommit: "a".repeat(40),
  targetId: profile,
  schema: profile === "local-public" ? "public" : "ledgerone",
  postgresVersion: "17.6",
  connectionMode: "direct",
  migrationDigest: "b".repeat(64),
  catalogDigest: "c".repeat(64),
  roleDigest: "d".repeat(64),
});
const profiles: EvidenceProfile[] = [
  "local-public",
  "local-private",
  "hosted-isolated",
];
const context = Object.fromEntries(profiles.map((p) => [p, binding(p)]));
// Synthetic policy fixtures, not claims that real W tests ran or were reviewed.
function evidence(selected = profiles): EvidenceBundle {
  return selected.map((profile) => ({
    profile,
    binding: binding(profile),
    checks: gateIds.map((id) => ({
      id,
      result: "PASS",
      assertions: [...gateRequirements[id]],
      artifact: `evidence/${profile}/${id}`,
      command: "synthetic-policy-fixture",
    })),
  }));
}
it("D-T01 local readiness can pass without hosted permission or overall approval", () => {
  const result = evaluateGateEvidence(
    evidence(["local-public", "local-private"]),
    context,
  );
  expect(result.localReadiness.result).toBe("PASS");
  expect(result.hostedVerification.result).toBe("NOT_RUN");
  expect(result.overall).toBe("FAIL");
  expect(result.financialWritesEnabled).toBe(false);
});
it("D-T01 complete evidence still cannot authorize any financial capability", () => {
  const result = evaluateGateEvidence(evidence(), context);
  expect(result.overall).toBe("PASS");
  expect(result).toMatchObject({
    financialWritesEnabled: false,
    productionAuthorized: false,
    consumerRawPostingEnabled: false,
  });
});
it.each(gateIds)(
  "D-T01 incomplete %s cannot pass even if every other row is green",
  (id) => {
    const input = evidence();
    input[1]!.checks.find((c) => c.id === id)!.assertions.pop();
    const result = evaluateGateEvidence(input, context);
    expect(result.overall).toBe("FAIL");
    expect(
      id === "W15" ? result.releaseReview.result : result.localReadiness.result,
    ).toBe("FAIL");
  },
);
it.each(["FAIL", "NOT_RUN", "NOT_PROVEN"] as const)(
  "D-T01 %s is never promoted to PASS",
  (result) => {
    const input = evidence();
    input[2]!.checks.find((c) => c.id === "W14")!.result = result;
    expect(evaluateGateEvidence(input, context).overall).toBe("FAIL");
  },
);
it.each(Object.keys(binding("local-private")) as (keyof EvidenceBinding)[])(
  "D-T01 stale/wrong %s binding fails closed",
  (key) => {
    const expected = structuredClone(context);
    expected["local-private"] = {
      ...binding("local-private"),
      [key]: key === "schema" ? "public" : "mismatch",
    };
    expect(evaluateGateEvidence(evidence(), expected).overall).toBe("FAIL");
  },
);
it("D-T01 duplicate profiles or requirements cannot substitute for missing evidence", () => {
  const input = evidence();
  input[1] = structuredClone(input[0]!);
  expect(evaluateGateEvidence(input, context).overall).toBe("FAIL");
  const duplicate = evidence();
  duplicate[1]!.checks[1] = structuredClone(duplicate[1]!.checks[0]!);
  expect(evaluateGateEvidence(duplicate, context).overall).toBe("FAIL");
});
it("D-T01 unknown/internal capability fields or invented assertions fail closed", () => {
  const input = evidence();
  expect(
    evaluateGateEvidence([{ ...input[0], enableWrites: true }], context)
      .overall,
  ).toBe("FAIL");
  input[0]!.checks[0]!.assertions.push("invented-test");
  expect(evaluateGateEvidence(input, context).overall).toBe("FAIL");
});
it("D-T01 missing/invalid evidence cannot produce a local or complete PASS", () => {
  expect(evaluateGateEvidence([], context).localReadiness.result).toBe(
    "NOT_RUN",
  );
  expect(evaluateGateEvidence(null, context).overall).toBe("FAIL");
  expect(evaluateGateEvidence(evidence(), {}).overall).toBe("FAIL");
});
it("D-T01 all original findings remain traced, with S07 ownership retained", () => {
  expect(Object.keys(findingOwners)).toEqual([
    "A05-01",
    "A05-02",
    "A05-03",
    "A05-04",
    "A05-05",
  ]);
  expect(findingOwners["A05-04"]).toContain("P1-S07");
  expect(findingOwners["A05-05"]).toContain("P1-S07");
});

it("D-T01 local components do not wait for final hosted/reviewed-merge evidence", () => {
  const input = evidence(["local-public", "local-private"]);
  for (const profile of input)
    profile.checks = profile.checks.filter((r) => r.id !== "W15");
  const result = evaluateGateEvidence(input, context);
  expect(result.localReadiness.result).toBe("PASS");
  expect(result.releaseReview.result).toBe("FAIL");
  expect(result.overall).toBe("FAIL");
});
