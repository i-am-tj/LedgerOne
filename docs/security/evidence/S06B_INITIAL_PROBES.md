# S06B initial-head independent probes

Exact reviewed head: fd889e468f8e6c7ca07f8074b377886e1782ec7c, 2026-11-12. These scripts reproduce the initial defects and MAX precision evidence without modifying implementation/tests. After correction, use permanent regressions to verify the changed contract; these initial-head scripts intentionally describe the original behavior.

From repository root with Node 22.22.0, dependencies and a guarded local test profile, extract the first block to `/private/tmp/ledgerone-s06b-review-probes.mjs`, second to `/private/tmp/ledgerone-s06b-attest-review.mjs`, then run `node --conditions=react-server --import tsx <script-path>`. Local CREATE DATABASE/CREATE ROLE is required. Only generated disposable DBs/synthetic sessions are changed; no hosted connection. On non-macOS systems use a writable temporary path for scripts/output JSON. The first lock observer's migration_name filter missed the actual blocked column catalog query; only the corrected second observer supports R03.

```javascript
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const root = process.cwd();
const { readCommandBody } = await import(
  pathToFileURL(root + "/src/lib/ledger/commands/contract.ts")
);
const results = [];
const record = (name, value) => {
  results.push({ name, ...value });
  console.log(JSON.stringify(results.at(-1)));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// No implementation/test files are changed by these independent probes.
let complete;
const abort = new AbortController();
const stream = new ReadableStream({
  start(c) {
    complete = () => c.close();
  },
});
const pending = readCommandBody(
  new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
    signal: abort.signal,
  }),
).then(
  () => "resolved",
  () => "rejected",
);
abort.abort();
record("aborted stalled body", {
  afterAbort: await Promise.race([
    pending,
    sleep(100).then(() => "still pending"),
  ]),
});
complete();
await pending;
let cancelRelease;
const cancelWait = new Promise((r) => {
  cancelRelease = r;
});
const oversized = new ReadableStream({
  start(c) {
    c.enqueue(new Uint8Array(131073));
  },
  cancel() {
    return cancelWait;
  },
});
const over = readCommandBody(
  new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: oversized,
    duplex: "half",
  }),
).then(
  () => "resolved",
  () => "rejected",
);
record("oversized body cancellation cleanup", {
  afterLimit: await Promise.race([
    over,
    sleep(100).then(() => "still pending"),
  ]),
});
cancelRelease();
await over;
const { postHarness } = await import(
  pathToFileURL(root + "/tests/support/post-harness.ts")
);
const { postRequest } = await import(
  pathToFileURL(root + "/src/lib/ledger/commands/http.ts")
);
const h = await postHarness();
const counts = async () =>
  (
    await h.admin.query(
      "SELECT (SELECT count(*) FROM journal)::int AS j,(SELECT count(*) FROM posting)::int AS p,(SELECT count(*) FROM ledger_operation)::int AS o,(SELECT count(*) FROM audit_event)::int AS a",
    )
  ).rows[0];
try {
  const before = await counts(),
    cancelled = new AbortController();
  cancelled.abort();
  const response = await postRequest(
    new Request(
      h.runtime.config.baseURL +
        "/api/workspaces/" +
        h.users[0].workspace +
        "/ledger/commands",
      {
        method: "POST",
        headers: {
          origin: h.runtime.config.baseURL,
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
          cookie: h.cookie(0),
        },
        body: JSON.stringify(h.payload()),
        signal: cancelled.signal,
      },
    ),
    h.users[0].workspace,
    h.runtime,
    h.executor,
    () => {},
  );
  record("already-cancelled authenticated POST", {
    status: response.status,
    before,
    after: await counts(),
  });
  const max = "9999999999999999.99";
  const payload = h.payload();
  payload.legs = Array.from({ length: 500 }, (_, i) => ({
    ...payload.legs[i % 2],
    amount: max,
  }));
  const r = await h.api(0, randomUUID(), payload);
  assert.equal(r.status, 201);
  const financial = await r.json();
  assert(
    financial.legs.every(
      (l) =>
        l.nativeMinor === "999999999999999999" &&
        l.functionalMinor === l.nativeMinor,
    ),
  );
  const total = (
    await h.admin.query(
      'SELECT sum("nativeMinor")::text AS total FROM posting WHERE "journalId"=$1 AND side=\'DEBIT\'',
      [financial.journalId],
    )
  ).rows[0].total;
  assert.equal(total, "249999999999999999750");
  record("500-leg MAX precision", {
    status: r.status,
    legCount: financial.legs.length,
    perLeg: "999999999999999999",
    debitTotal: total,
  });
  const lock = await h.admin.connect();
  await lock.query(
    "BEGIN; LOCK TABLE _prisma_migrations IN ACCESS EXCLUSIVE MODE",
  );
  try {
    const start = Date.now();
    const blocked = await h.api(0, randomUUID(), h.payload());
    const held = await h.admin.query(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%migration_name%'",
    );
    record("attestation deadline resource cleanup", {
      status: blocked.status,
      elapsedMs: Date.now() - start,
      blockedVerifierQueriesAfterResponse: held.rows[0].count,
    });
  } finally {
    await lock.query("ROLLBACK");
    lock.release();
  }
} finally {
  await h.cleanup();
  writeFileSync(
    "/private/tmp/ledgerone-s06b-review-results.json",
    JSON.stringify(results, null, 2) + "\n",
    { mode: 0o600 },
  );
}
```

```javascript
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
const { postHarness } = await import(
  pathToFileURL(process.cwd() + "/tests/support/post-harness.ts")
);
const h = await postHarness();
const lock = await h.admin.connect();
try {
  await lock.query(
    "BEGIN; LOCK TABLE _prisma_migrations IN ACCESS EXCLUSIVE MODE",
  );
  const start = Date.now(),
    response = await h.api(0, randomUUID(), h.payload());
  const rows = (
    await h.admin.query(
      "SELECT state,wait_event_type,left(query,95) AS catalogQueryPrefix FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'",
    )
  ).rows;
  const result = {
    status: response.status,
    elapsedMs: Date.now() - start,
    remainingBlockedCatalogQueries: rows,
  };
  console.log(JSON.stringify(result));
  writeFileSync(
    "/private/tmp/ledgerone-s06b-attest-review.json",
    JSON.stringify(result, null, 2) + "\n",
    { mode: 0o600 },
  );
} finally {
  await lock.query("ROLLBACK");
  lock.release();
  await h.cleanup();
}
```

Observed initial results: aborted stalled body and oversized-body cancellation cleanup stayed pending; an already-aborted authenticated POST returned 201 and added 1 journal/2 postings/1 receipt/1 audit. The 500-leg maximum journal returned exact 999999999999999999 per leg and 249999999999999999750 total debits. Corrected lock observation saw 503 after 10112 ms with one active column catalog query still waiting on Lock. All owned locks were released and disposable connections/databases/roles cleaned without FORCE.
