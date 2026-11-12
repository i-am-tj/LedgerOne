import { expect, it } from "vitest";
import { inversePostings, parseCommand, requestHash } from "./contract";
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];
const reverse = {
  kind: "REVERSE",
  originalJournalId: ids[0],
  effectiveAt: "2026-02-01T05:30:00+05:30",
  description: " Fix ",
  reason: " Fix ",
};
const replacement = {
  effectiveAt: "2026-03-01T00:00:00Z",
  legs: [
    {
      accountId: ids[0],
      side: "DEBIT",
      currency: "INR",
      amount: "9999999999999999.99",
    },
    {
      accountId: ids[1],
      side: "CREDIT",
      currency: "INR",
      amount: "9999999999999999.99",
    },
  ],
};
it("C-T01 independent dates and canonical target/kind/replacement semantics", () => {
  const r = parseCommand(reverse);
  const a = parseCommand({ ...reverse, kind: "CORRECT", replacement });
  expect(r.effectiveAt).toBe("2026-02-01T00:00:00.000Z");
  expect(requestHash("owner", "workspace", r)).toBe(
    "dfd46d87890abb60a49153dba43095809001246d66ac45b83d72825c943da71a",
  );
  expect(requestHash("owner", "workspace", a)).toBe(
    "9a8fd1cd6def670887a5d068ea58eed5285af9d20f9543bd0c2a55e22b66a81d",
  );
  expect(a.kind).toBe("CORRECT");
  if (a.kind !== "CORRECT") throw Error();
  expect(a.replacement.effectiveAt).toBe("2026-03-01T00:00:00.000Z");
  const b = parseCommand({
    ...reverse,
    kind: "CORRECT",
    replacement: { ...replacement, legs: [...replacement.legs].reverse() },
  });
  expect(requestHash("owner", "workspace", a)).toBe(
    requestHash("owner", "workspace", b),
  );
  expect(requestHash("owner", "workspace", r)).not.toBe(
    requestHash("owner", "workspace", a),
  );
  for (const change of [
    { originalJournalId: ids[1] },
    { effectiveAt: "2026-03-01T00:00:00Z" },
    { reason: "Different" },
  ])
    expect(
      requestHash(
        "owner",
        "workspace",
        parseCommand({ ...reverse, ...change }),
      ),
    ).not.toBe(requestHash("owner", "workspace", r));
  expect(
    requestHash(
      "owner",
      "workspace",
      parseCommand({
        ...reverse,
        kind: "CORRECT",
        replacement: { ...replacement, effectiveAt: "2026-04-01T00:00:00Z" },
      }),
    ),
  ).not.toBe(requestHash("owner", "workspace", a));
});
it.each([
  "legs",
  "ownerId",
  "actorId",
  "draftId",
  "revision",
  "operationId",
  "replacement",
])("C-T01 REVERSE rejects %s", (field) => {
  expect(() => parseCommand({ ...reverse, [field]: [] })).toThrow(
    "invalid_request",
  );
});
it.each(["reason", "originalJournalId", "kind", "journalId", "ownerId"])(
  "C-T01 CORRECT replacement rejects %s",
  (field) => {
    expect(() =>
      parseCommand({
        ...reverse,
        kind: "CORRECT",
        replacement: { ...replacement, [field]: "injected" },
      }),
    ).toThrow("invalid_request");
  },
);
it("C-T01 correction rejects absent/invalid replacement, bad dates and fake command kinds", () => {
  for (const value of [
    { ...reverse, kind: "CORRECT" },
    { ...reverse, effectiveAt: "2026-02-30T00:00:00Z" },
    { ...reverse, kind: "OPENING" },
    { ...reverse, kind: "CORRECT", replacement: { ...replacement, legs: [] } },
  ])
    expect(() => parseCommand(value)).toThrow("invalid_request");
});
it("C-T01 inverse preserves duplicates, exact maximum units, full multiset and involution", () => {
  for (const n of [1, 2, 250]) {
    const rows = Array.from({ length: n }, () => [
      {
        accountId: ids[0]!,
        side: "DEBIT",
        currency: "INR",
        nativeMinor: "999999999999999999",
        functionalMinor: "999999999999999999",
        fxRateId: null,
      },
      {
        accountId: ids[1]!,
        side: "CREDIT",
        currency: "INR",
        nativeMinor: "999999999999999999",
        functionalMinor: "999999999999999999",
        fxRateId: null,
      },
    ]).flat();
    const inverse = inversePostings(rows);
    expect(inverse).toHaveLength(n * 2);
    expect(
      inverse.filter((l) => l.side === "CREDIT" && l.accountId === ids[0]),
    ).toHaveLength(n);
    const twice = inversePostings(
      inverse.map((l) => ({
        ...l,
        nativeMinor: l.minor,
        functionalMinor: l.minor,
        fxRateId: null,
      })),
    );
    expect(
      twice.filter((l) => l.side === "DEBIT" && l.accountId === ids[0]),
    ).toHaveLength(n);
    expect(twice.every((l) => l.minor === "999999999999999999")).toBe(true);
  }
});
it("C-T01 inverse fails closed on invalid financial evidence", () => {
  const rows = ids.map((id, i) => ({
    accountId: id,
    side: i ? "CREDIT" : "DEBIT",
    currency: "INR",
    nativeMinor: "100",
    functionalMinor: "100",
    fxRateId: null as string | null,
  }));
  for (const change of [
    { currency: "USD" },
    { side: "OTHER" },
    { nativeMinor: "101", functionalMinor: "101" },
    { nativeMinor: "0" },
    { functionalMinor: "99" },
    { fxRateId: ids[0]! },
    { nativeMinor: "1000000000000000000" },
  ])
    expect(() =>
      inversePostings([{ ...rows[0]!, ...change }, rows[1]!]),
    ).toThrow();
  expect(() => inversePostings([])).toThrow();
});
