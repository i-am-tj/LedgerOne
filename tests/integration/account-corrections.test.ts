import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { postHarness } from "../support/post-harness";
import { handleTransactions } from "../../src/lib/transactions/http";
const current = vi.hoisted(() => ({
  runtime: undefined as unknown,
  database: undefined as unknown,
  executor: undefined as unknown,
}));
vi.mock("../../src/lib/auth/server", () => ({
  getAuthRuntime: () => current.runtime,
}));
vi.mock("../../src/lib/database", () => ({
  getDatabase: () => current.database,
}));
vi.mock("../../src/lib/accounts/capability", () => ({
  getAccountExecutor: () => current.executor,
}));
import { accountRequest } from "../../src/lib/accounts/http";
describe.each(["public", "ledgerone"] as const)(
  "S07 corrections %s real sessions/handler/restricted writer",
  (schema) => {
    let h: Awaited<ReturnType<typeof postHarness>>,
      previous: string | undefined;
    beforeAll(async () => {
      h = await postHarness({ schema, accounts: true });
      current.runtime = h.runtime;
      current.database = h.database;
      current.executor = h.executor;
      previous = process.env.DATABASE_URL;
      process.env.DATABASE_URL = h.admin.options.connectionString;
    }, 30000);
    afterAll(async () => {
      process.env.DATABASE_URL = previous;
      await h?.cleanup();
    });
    const call = (
      body?: unknown,
      key: string = randomUUID(),
      user: number | null = 0,
      workspace = h.users[0]!.workspace,
      origin = h.runtime.config.baseURL,
    ) =>
      accountRequest(
        new Request(
          h.runtime.config.baseURL +
            "/api/accounts" +
            (body === undefined ? "" : "?workspace=" + workspace),
          {
            method: body === undefined ? "GET" : "POST",
            headers: {
              origin,
              "content-type": "application/json",
              "idempotency-key": key,
              ...(user === null ? {} : { cookie: h.cookie(user) }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          },
        ),
      );
    async function create(name = "Bank", kind = "BANK", opening = "50000") {
      const r = await call({
        kind: "CREATE_ACCOUNT",
        name,
        accountKind: kind,
        opening,
        effectiveAt: "2026-01-01T00:00:00+05:30",
      });
      expect(r.status).toBe(201);
      return (await r.json()).accountId as string;
    }
    async function read(id: string) {
      const r = await call();
      expect(r.status).toBe(200);
      return (await r.json()).accounts.find((a: { id: string }) => a.id === id);
    }
    const correction = (
      accountId: string,
      originalJournalId: string,
      amount = "40000",
      kind = "CORRECT_OPENING",
    ) => ({
      kind,
      accountId,
      originalJournalId,
      amount,
      effectiveAt: "2026-01-01T00:00:00+05:30",
      replacementEffectiveAt: "2026-01-01T00:00:00+05:30",
      reason: "Correct historical amount",
    });
    async function snapshot() {
      return (
        await h.admin.query(
          `SELECT jsonb_build_object('a',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ledger_account t),'j',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM journal t),'p',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM posting t),'o',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ledger_operation t),'audit',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_event t),'markers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM opening_balance t),'correction',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "operationId") FROM account_correction t))::text s`,
        )
      ).rows[0].s;
    }
    it("signed opening correction, zero and resumption preserve one immutable original marker and exact replay after archive", async () => {
      const id = await create("Original bank"),
        initial = await read(id),
        root = initial.openingCorrection.originalJournalId;
      const original = (
        await h.admin.query(
          "SELECT to_jsonb(j)::text j FROM journal j WHERE id=$1",
          [root],
        )
      ).rows[0].j;
      const markers = (
        await h.admin.query(
          'SELECT to_jsonb(b)::text b FROM opening_balance b WHERE "accountId"=$1',
          [id],
        )
      ).rows;
      const body = correction(id, root),
        key = randomUUID(),
        first = await call(body, key);
      expect(first.status).toBe(201);
      const result = await first.json();
      expect((await read(id)).balanceMinor).toBe("4000000");
      expect(
        (
          await call({
            kind: "RENAME_ACCOUNT",
            accountId: id,
            name: "Later name",
          })
        ).status,
      ).toBe(201);
      expect(
        (await call({ kind: "ARCHIVE_ACCOUNT", accountId: id })).status,
      ).toBe(201);
      const archived = (
        await h.admin.query(
          'SELECT "archivedAt"::text a,"updatedAt"::text u FROM ledger_account WHERE id=$1',
          [id],
        )
      ).rows[0];
      const replay = await call(body, key);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(result);
      expect((await call({ ...body, amount: "40001" }, key)).status).toBe(409);
      let target = (await read(id)).openingCorrection.originalJournalId;
      expect((await call(correction(id, target, "-100"))).status).toBe(201);
      expect((await read(id)).balanceMinor).toBe("-10000");
      target = (await read(id)).openingCorrection.originalJournalId;
      expect((await call(correction(id, target, "0"))).status).toBe(201);
      expect((await read(id)).balanceMinor).toBe("0");
      target = (await read(id)).openingCorrection.originalJournalId;
      expect((await call(correction(id, target, "2500"))).status).toBe(201);
      expect((await read(id)).balanceMinor).toBe("250000");
      expect(
        (
          await h.admin.query(
            'SELECT "archivedAt"::text a,"updatedAt"::text u FROM ledger_account WHERE id=$1',
            [id],
          )
        ).rows[0],
      ).toEqual(archived);
      expect(
        (
          await h.admin.query(
            "SELECT to_jsonb(j)::text j FROM journal j WHERE id=$1",
            [root],
          )
        ).rows[0].j,
      ).toBe(original);
      expect(
        (
          await h.admin.query(
            'SELECT to_jsonb(b)::text b FROM opening_balance b WHERE "accountId"=$1',
            [id],
          )
        ).rows,
      ).toEqual(markers);
      const before = await snapshot();
      expect((await call(body)).status).toBe(409);
      expect(await snapshot()).toBe(before);
    });
    it("restored opening provenance remains unavailable to generic reversal", async () => {
      const id = await create(),
        initial = await read(id);
      expect(
        (
          await call(
            correction(id, initial.openingCorrection.originalJournalId, "0"),
          )
        ).status,
      ).toBe(201);
      const zero = await read(id);
      const restored = await call(
        correction(id, zero.openingCorrection.originalJournalId, "100"),
      );
      expect(restored.status).toBe(201);
      const result = await restored.json();
      const before = await snapshot();
      const denied = await h.api(0, randomUUID(), {
        kind: "REVERSE",
        originalJournalId: result.journalId,
        effectiveAt: "2026-01-01T00:00:00Z",
        reason: "Generic must reject opening lineage",
      });
      expect(denied.status).toBe(409);
      expect(await snapshot()).toBe(before);
    });
    it("liability openings use credit-normal signs", async () => {
      const id = await create("Debt", "LOAN", "20000"),
        a = await read(id);
      expect(
        (
          await call(
            correction(id, a.openingCorrection.originalJournalId, "15000"),
          )
        ).status,
      ).toBe(201);
      expect((await read(id)).balanceMinor).toBe("1500000");
    });
    it.each(["EXPENSE", "INCOME"])(
      "archived %s corrects exact original accounts/classification without unarchive",
      async (kind) => {
        const id = await create(`Original ${kind}`),
          capture = await handleTransactions(
            new Request(
              h.runtime.config.baseURL +
                "/api/transactions?workspace=" +
                h.users[0]!.workspace,
              {
                method: "POST",
                headers: {
                  origin: h.runtime.config.baseURL,
                  cookie: h.cookie(0),
                  "idempotency-key": randomUUID(),
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  kind,
                  accountId: id,
                  amount: "850",
                  category: kind === "EXPENSE" ? "Groceries" : "Salary",
                  effectiveAt: "2026-01-01T00:00:00+05:30",
                }),
              },
            ),
            h.runtime,
            h.database,
            h.executor!,
            schema,
          );
        expect(capture.status).toBe(201);
        const old = await capture.json();
        await call({ kind: "ARCHIVE_ACCOUNT", accountId: id });
        const before = (
          await h.admin.query(
            'SELECT "archivedAt"::text t FROM ledger_account WHERE id=$1',
            [id],
          )
        ).rows[0].t;
        const body = correction(
            id,
            old.post.journalId,
            "700",
            "CORRECT_ACCOUNT_ENTRY",
          ),
          key = randomUUID(),
          r = await call(body, key);
        expect(r.status).toBe(201);
        const outcome = await r.json();
        expect((await read(id)).balanceMinor).toBe(
          kind === "EXPENSE" ? "4930000" : "5070000",
        );
        const retry = await call(body, key);
        expect(retry.status).toBe(200);
        expect(await retry.json()).toEqual(outcome);
        expect(
          (
            await h.admin.query(
              'SELECT "archivedAt"::text t FROM ledger_account WHERE id=$1',
              [id],
            )
          ).rows[0].t,
        ).toBe(before);
        expect(
          (
            await h.database.transactionRecord.findUniqueOrThrow({
              where: { operationId: old.post.operationId },
            })
          ).amountMinor.toString(),
        ).toBe("85000");
        const head = (await read(id)).entryCorrections.find(
          (c: { rootJournalId: string }) =>
            c.rootJournalId === old.post.journalId,
        );
        expect(
          (
            await call(
              correction(
                id,
                head.originalJournalId,
                "0",
                "CORRECT_ACCOUNT_ENTRY",
              ),
            )
          ).status,
        ).toBe(201);
        const zero = (await read(id)).entryCorrections.find(
          (c: { rootJournalId: string }) =>
            c.rootJournalId === old.post.journalId,
        );
        const restoration = await call(
          correction(
            id,
            zero.originalJournalId,
            "600",
            "CORRECT_ACCOUNT_ENTRY",
          ),
        );
        expect(restoration.status).toBe(201);
        const resumed = await restoration.json();
        const overview = await handleTransactions(
          new Request(
            h.runtime.config.baseURL +
              "/api/transactions?workspace=" +
              h.users[0]!.workspace,
            { headers: { cookie: h.cookie(0) } },
          ),
          h.runtime,
          h.database,
          null,
          schema,
        );
        expect(overview.status).toBe(200);
        const history = await overview.json();
        expect(
          history.transactions.filter(
            (t: { operationId: string }) =>
              t.operationId === old.post.operationId,
          ),
        ).toHaveLength(1);
        expect((await read(id)).balanceMinor).toBe(
          kind === "EXPENSE" ? "4940000" : "5060000",
        );
        const beforeAlias = await snapshot();
        const sql = await h.admin.connect();
        try {
          await sql.query("BEGIN");
          await sql.query(`SET LOCAL ROLE "${h.role}"`);
          await expect(
            (async () => {
              await sql.query(
                `INSERT INTO transaction_record("operationId","workspaceId","ownerId",kind,"accountId","categoryAccountId","accountName","categoryName","amountMinor") SELECT $1,"workspaceId","ownerId",kind,"accountId","categoryAccountId","accountName","categoryName",60000 FROM transaction_record WHERE "operationId"=$2`,
                [resumed.operationId, old.post.operationId],
              );
              await sql.query("COMMIT");
            })(),
          ).rejects.toMatchObject({ code: "23514" });
        } finally {
          await sql.query("ROLLBACK");
          sql.release();
        }
        expect(await snapshot()).toBe(beforeAlias);
      },
    );
    it("wrong owners, workspaces, raw legs and unsupported targets leave no effects", async () => {
      const id = await create(),
        a = await read(id),
        body = correction(id, a.openingCorrection.originalJournalId);
      for (const [value, user, scope, origin] of [
        [body, 1, h.users[0]!.workspace, h.runtime.config.baseURL],
        [body, null, h.users[0]!.workspace, h.runtime.config.baseURL],
        [body, 0, h.users[1]!.workspace, h.runtime.config.baseURL],
        [
          { ...body, ownerId: h.users[1]!.id },
          0,
          h.users[0]!.workspace,
          h.runtime.config.baseURL,
        ],
        [
          { ...body, legs: [] },
          0,
          h.users[0]!.workspace,
          h.runtime.config.baseURL,
        ],
        [body, 0, h.users[0]!.workspace, "https://wrong.example"],
      ] as const) {
        const before = await snapshot();
        expect([400, 401, 403, 404]).toContain(
          (await call(value, randomUUID(), user, scope, origin)).status,
        );
        expect(await snapshot()).toBe(before);
      }
    });
    it.each(["receipt", "postings", "audit", "beforeCommit"] as const)(
      "%s failure rolls back intent, journals and audit",
      async (stage) => {
        const id = await create(),
          a = await read(id),
          before = await snapshot();
        h.setProbe(async (s) => {
          if (s === stage) throw Error("Deliberate correction rollback");
        });
        try {
          expect(
            (await call(correction(id, a.openingCorrection.originalJournalId)))
              .status,
          ).toBe(503);
        } finally {
          h.setProbe(undefined);
        }
        expect(await snapshot()).toBe(before);
      },
    );
    it("same-key and distinct-key competing corrections remain atomic; archive/restore races preserve locks", async () => {
      const id = await create(),
        a = await read(id),
        body = correction(id, a.openingCorrection.originalJournalId),
        key = randomUUID();
      const res = await Promise.all([call(body, key), call(body, key)]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 201]);
      const saved = await Promise.all(res.map((r) => r.json()));
      expect(saved[0]).toEqual(saved[1]);
      let head = (await read(id)).openingCorrection.originalJournalId;
      const competing = await Promise.all([
        call(correction(id, head, "30000")),
        call(correction(id, head, "35000")),
      ]);
      expect(competing.map((r) => r.status).sort()).toEqual([201, 409]);
      head = (await read(id)).openingCorrection.originalJournalId;
      const race = await Promise.all([
        call(correction(id, head, "25000")),
        call({ kind: "ARCHIVE_ACCOUNT", accountId: id }),
      ]);
      expect(race.map((r) => r.status)).toEqual([201, 201]);
      const final = await read(id);
      expect(final.balanceMinor).toBe("2500000");
      expect(final.archivedAt).not.toBeNull();
    });
    it("direct SQL balanced but wrong replacement amount fails atomically", async () => {
      const id = await create(),
        a = await read(id),
        original = a.openingCorrection.originalJournalId;
      await call({ kind: "ARCHIVE_ACCOUNT", accountId: id });
      const before = await snapshot();
      const c = await h.admin.connect();
      try {
        await c.query("BEGIN");
        await c.query(`SET LOCAL ROLE "${h.role}"`);
        const op = randomUUID(),
          rev = randomUUID(),
          replacement = randomUUID(),
          hash = "b".repeat(64),
          wid = h.users[0]!.workspace,
          uid = h.users[0]!.id;
        await c.query(
          `INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,'CORRECT')`,
          [op, wid, uid, randomUUID(), hash],
        );
        await c.query(
          `INSERT INTO account_correction("operationId","workspaceId","ownerId","accountId","originalJournalId","rootJournalId","reversalJournalId","replacementJournalId",mode,"amountMinor","commandHash","effectiveAt","replacementEffectiveAt") VALUES($1,$2,$3,$4,$5,$5,$6,$7,'OPENING',4000000,$8,'2026-01-01T00:00:00+05:30','2026-01-01T00:00:00+05:30')`,
          [op, wid, uid, id, original, rev, replacement, hash],
        );
        const old = (
          await c.query('SELECT * FROM posting WHERE "journalId"=$1', [
            original,
          ])
        ).rows;
        for (const [j, reversal] of [
          [rev, true],
          [replacement, false],
        ] as const) {
          await c.query(
            `INSERT INTO journal(id,"workspaceId","ownerId",kind,"reversesJournalId","effectiveAt") VALUES($1,$2,$3,$4,$5,'2026-01-01T00:00:00+05:30')`,
            [
              j,
              wid,
              uid,
              reversal ? "REVERSAL" : "GENERAL",
              reversal ? original : null,
            ],
          );
          for (const p of old)
            await c.query(
              `INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,'INR',$6,$7,$7)`,
              [
                randomUUID(),
                j,
                wid,
                uid,
                p.accountId,
                reversal ? (p.side === "DEBIT" ? "CREDIT" : "DEBIT") : p.side,
                reversal ? p.nativeMinor : "1",
              ],
            );
          await c.query(
            `UPDATE journal SET status='POSTED',"postedAt"=clock_timestamp(),"operationId"=$1 WHERE id=$2`,
            [op, j],
          );
        }
        await c.query(
          `INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$3,$4,'ledger.corrected',$5,$6,'Deliberately malformed replacement')`,
          [randomUUID(), wid, uid, randomUUID(), op, original],
        );
        await expect(c.query("COMMIT")).rejects.toMatchObject({
          code: "23514",
        });
      } finally {
        await c.query("ROLLBACK");
        c.release();
      }
      expect(await snapshot()).toBe(before);
    });
    it("independent correction dates and zero resumption contention preserve effective balances", async () => {
      const id = await create(),
        initial = await read(id),
        body = correction(
          id,
          initial.openingCorrection.originalJournalId,
          "40000",
        );
      body.replacementEffectiveAt = "2026-02-01T00:00:00+05:30";
      expect((await call(body)).status).toBe(201);
      const early = await accountRequest(
        new Request(
          h.runtime.config.baseURL +
            "/api/accounts?asOf=" +
            encodeURIComponent("2026-01-31T23:59:59+05:30"),
          { headers: { cookie: h.cookie(0) } },
        ),
      );
      expect(early.status).toBe(200);
      expect(
        (await early.json()).accounts.find((a: { id: string }) => a.id === id)
          .balanceMinor,
      ).toBe("0");
      let head = (await read(id)).openingCorrection.originalJournalId;
      expect((await call(correction(id, head, "0"))).status).toBe(201);
      head = (await read(id)).openingCorrection.originalJournalId;
      const res = await Promise.all([
        call(correction(id, head, "100")),
        call(correction(id, head, "200")),
      ]);
      expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(["10000", "20000"]).toContain((await read(id)).balanceMinor);
    });
    it("account-route keys cannot change command namespace or probe a new target on replay", async () => {
      const key = randomUUID(),
        createBody = {
          kind: "CREATE_ACCOUNT",
          name: "Scoped key bank",
          accountKind: "BANK",
          opening: "50000",
          effectiveAt: "2026-01-01T00:00:00+05:30",
        };
      const r = await call(createBody, key);
      expect(r.status).toBe(201);
      const id = (await r.json()).accountId,
        a = await read(id),
        body = correction(id, a.openingCorrection.originalJournalId);
      let before = await snapshot();
      expect((await call(body, key)).status).toBe(409);
      expect(await snapshot()).toBe(before);
      const correctionKey = randomUUID();
      expect((await call(body, correctionKey)).status).toBe(201);
      before = await snapshot();
      expect(
        (await call({ kind: "ARCHIVE_ACCOUNT", accountId: id }, correctionKey))
          .status,
      ).toBe(409);
      expect(
        (
          await call(
            { ...body, originalJournalId: randomUUID() },
            correctionKey,
          )
        ).status,
      ).toBe(409);
      expect(await snapshot()).toBe(before);
      expect((await call(createBody, key)).status).toBe(200);
    });
    it("unregistered direct SQL still cannot post to archived accounts; correction evidence append-only", async () => {
      const id = await create(),
        a = await read(id);
      await call({ kind: "ARCHIVE_ACCOUNT", accountId: id });
      const c = await h.admin.connect();
      try {
        await c.query("BEGIN");
        await c.query(`SET LOCAL ROLE "${h.role}"`);
        const j = randomUUID();
        await c.query(
          'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",kind) VALUES($1,$2,$3,now(),\'GENERAL\')',
          [j, h.users[0]!.workspace, h.users[0]!.id],
        );
        await expect(
          c.query(
            'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',\'DEBIT\',1,1)',
            [randomUUID(), j, h.users[0]!.workspace, h.users[0]!.id, id],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      } finally {
        await c.query("ROLLBACK");
        c.release();
      }
      expect(
        (await call(correction(id, a.openingCorrection.originalJournalId)))
          .status,
      ).toBe(201);
      await expect(
        h.admin.query('UPDATE account_correction SET "amountMinor"=1'),
      ).rejects.toMatchObject({ code: "23514" });
    });
  },
);
