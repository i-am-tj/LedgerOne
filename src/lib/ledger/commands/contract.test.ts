import { expect, it, vi } from "vitest";
import {
  parsePost,
  requestHash,
  instant,
  idempotencyKey,
  readCommandBody,
} from "./contract";
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];
const value = {
  kind: "POST",
  effectiveAt: "2026-01-01T05:30:00+05:30",
  reason: " Purchase ",
  legs: [
    { accountId: ids[0], side: "DEBIT", currency: "INR", amount: "1.00" },
    { accountId: ids[1], side: "CREDIT", currency: "INR", amount: "1" },
  ],
};
it("B-T01 canonical semantic vectors preserve exact amounts and normalize equivalent inputs", () => {
  const a = parsePost(value),
    hash = requestHash("owner", "workspace", a);
  expect(hash).toBe(
    "a29170255beec270a25bc7da74d13157093bb6c502fde8f7deea0186d4c0cc12",
  );
  expect(a.effectiveAt).toBe("2026-01-01T00:00:00.000Z");
  expect(a.reason).toBe("Purchase");
  for (const amount of ["1", "1.0", "1.00"]) {
    const b = parsePost({
      ...value,
      effectiveAt: a.effectiveAt,
      legs: [...value.legs].reverse().map((l) => ({ ...l, amount })),
    });
    expect(requestHash("owner", "workspace", b)).toBe(hash);
  }
  expect(requestHash("other", "workspace", a)).not.toBe(hash);
  expect(requestHash("owner", "other", a)).not.toBe(hash);
  expect(
    requestHash("owner", "workspace", parsePost({ ...value, reason: "Other" })),
  ).not.toBe(hash);
  expect(
    requestHash(
      "owner",
      "workspace",
      parsePost({ ...value, legs: [...value.legs, ...value.legs] }),
    ),
  ).not.toBe(hash);
  expect(parsePost({ ...value, description: " e\u0301 " }).description).toBe(
    "é",
  );
});
it.each([
  0,
  1,
  NaN,
  Infinity,
  "-1",
  "0",
  "1e2",
  "01",
  "1.001",
  "9999999999999999.999",
  "10000000000000000",
])("B-T01 rejects unsafe amount %s", (amount) => {
  expect(() =>
    parsePost({ ...value, legs: value.legs.map((l) => ({ ...l, amount })) }),
  ).toThrow("invalid_request");
});
it("B-T01 supports MAX_MINOR and rejects imbalance, invalid side/currency/UUID, unknown and internal fields", () => {
  expect(
    parsePost({
      ...value,
      legs: value.legs.map((l) => ({ ...l, amount: "9999999999999999.99" })),
    }).legs[0]!.minor,
  ).toBe("999999999999999999");
  for (const field of [
    "ownerId",
    "actorId",
    "workspaceId",
    "requestId",
    "journalId",
    "operationId",
    "postedAt",
    "requestHash",
    "draftId",
    "revision",
    "status",
    "fxRateId",
  ]) {
    expect(() => parsePost({ ...value, [field]: "injected" })).toThrow();
  }
  for (const patch of [
    { amount: "2" },
    { side: "OTHER" },
    { currency: "USD" },
    { accountId: "bad" },
    { unknown: "x" },
  ])
    expect(() =>
      parsePost({
        ...value,
        legs: [{ ...value.legs[0], ...patch }, value.legs[1]],
      }),
    ).toThrow();
  for (const p of [
    null,
    [],
    { ...value, legs: [] },
    { ...value, legs: [value.legs[0]] },
    { ...value, legs: Array(501).fill(value.legs[0]) },
    { ...value, reason: " " },
    { ...value, description: "\u0000" },
    { ...value, reason: "\ud800" },
    { ...value, reason: "x".repeat(501) },
  ])
    expect(() => parsePost(p)).toThrow();
  expect(
    parsePost({
      ...value,
      legs: Array.from({ length: 500 }, (_, i) => value.legs[i % 2]),
    }).legs,
  ).toHaveLength(500);
});
it.each([
  "2026-02-29T00:00:00Z",
  "2024-02-30T00:00:00Z",
  "2026-13-01T00:00:00Z",
  "2026-01-00T00:00:00Z",
  "2026-01-01T24:00:00Z",
  "2026-01-01T00:00:60Z",
  "2026-01-01T00:00:00.0001Z",
  "2026-01-01",
  "2026-01-01T00:00:00+24:00",
  "0000-01-01T00:00:00Z",
  "0001-01-01T00:00:00+01:00",
])("B-T01 rejects invalid calendar/precision %s", (s) =>
  expect(() => instant(s)).toThrow(),
);
it("B-T01 accepts leap days, early years and millisecond offsets", () => {
  expect(instant("2024-02-29T01:00:00.123+01:00")).toBe(
    "2024-02-29T00:00:00.123Z",
  );
  expect(instant("0001-01-01T00:00:00Z")).toBe("0001-01-01T00:00:00.000Z");
});
it("B-T01 bounds keys and rejects combined duplicate headers", () => {
  for (const key of [
    null,
    "short",
    "x".repeat(129),
    "abcd1234, abcd1234",
    " bad12345",
  ]) {
    expect(() => idempotencyKey(key)).toThrow();
  }
  expect(idempotencyKey("abcd1234")).toBe("abcd1234");
});
it("B-T01 bounded streaming JSON refuses malformed UTF-8 and bodies regardless of declared length", async () => {
  const req = (body: BodyInit, headers = {}) =>
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });
  await expect(readCommandBody(req(JSON.stringify(value)))).resolves.toEqual(
    value,
  );
  for (const request of [
    req("bad"),
    req("x".repeat(131073), { "content-length": "1" }),
    req(new Uint8Array([0xff])),
    req("{}", { "content-type": "text/plain" }),
  ])
    await expect(readCommandBody(request)).rejects.toThrow("invalid_request");
});

it("B-T05 canonical command and every leg are frozen across asynchronous authorization", () => {
  const p = parsePost(value);
  expect(Object.isFrozen(p)).toBe(true);
  expect(Object.isFrozen(p.legs)).toBe(true);
  expect(p.legs.every(Object.isFrozen)).toBe(true);
});

it("S06B-R01 stalled upload expires at the total read deadline", async () => {
  vi.useFakeTimers();
  try {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream({ start() {} }),
      duplex: "half",
    } as RequestInit);
    const pending = readCommandBody(request);
    const rejected = expect(pending).rejects.toMatchObject({
      status: 408,
      code: "request_timeout",
    });
    await vi.advanceTimersByTimeAsync(5001);
    await rejected;
  } finally {
    vi.useRealTimers();
  }
});
it("S06B-R01 aborted upload and hostile cancel cleanup settle without waiting", async () => {
  const controller = new AbortController();
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: controller.signal,
    body: new ReadableStream({
      start() {},
      cancel() {
        return new Promise(() => {});
      },
    }),
    duplex: "half",
  } as RequestInit);
  const pending = readCommandBody(request);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ status: 503 });
  const oversized = new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "1" },
    body: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(131073));
      },
      cancel() {
        return new Promise(() => {});
      },
    }),
    duplex: "half",
  } as RequestInit);
  await expect(readCommandBody(oversized)).rejects.toMatchObject({
    status: 400,
  });
});
it("S06B-R01 accepts exactly 128 KiB but rejects one extra byte", async () => {
  const req = (count: number) =>
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}" + " ".repeat(count - 2),
    });
  await expect(readCommandBody(req(131072))).resolves.toEqual({});
  await expect(readCommandBody(req(131073))).rejects.toMatchObject({
    status: 400,
  });
});
