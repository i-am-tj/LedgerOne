import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { getAuthRuntime } from "../auth/server";
import { authJSON, getOwnerSession } from "../auth/requests";
import { getDatabase } from "../database";
import { databaseSettings } from "../profile";
import { defaultCategory, findCategory } from "./catalog";
import { maskSecret, validateProfile } from "./contract";
import {
  openSecrets,
  sealSecrets,
  vaultConfigured,
  VaultUnavailable,
} from "./vault";
import type { Holding, WealthOverview } from "./types";

class WealthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly fields?: Record<string, string>,
  ) {
    super(code);
  }
}
type Actor = { ownerId: string; requestId: string };
const BODY_LIMIT = 32 * 1024;

async function readJSON(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new WealthError(400, "invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new WealthError(400, "invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        throw new WealthError(413, "payload_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new WealthError(400, "invalid_request");
  }
}

function schemaName() {
  const schema = databaseSettings(process.env).schema;
  if (schema !== "public" && schema !== "ledgerone")
    throw new WealthError(503, "service_unavailable");
  return schema;
}

async function balances(database: PrismaClient, ownerId: string) {
  const schema = schemaName();
  const posting = Prisma.raw(`"${schema}"."posting"`);
  const journal = Prisma.raw(`"${schema}"."journal"`);
  const rows = await database.$queryRaw<
    { accountId: string; debitMinor: string }[]
  >(Prisma.sql`
    SELECT p."accountId"::text AS "accountId", coalesce(sum(CASE p.side WHEN 'DEBIT'
      THEN p."nativeMinor"::numeric ELSE -p."nativeMinor"::numeric END),0)::text AS "debitMinor"
    FROM ${posting} p JOIN ${journal} j ON j.id=p."journalId"
      AND j."ownerId"=p."ownerId" AND j."workspaceId"=p."workspaceId"
    WHERE p."ownerId"=${ownerId} AND j.status='POSTED'
      AND j."effectiveAt"<=${new Date().toISOString()}::timestamptz
    GROUP BY p."accountId"`);
  return new Map(rows.map((r) => [r.accountId, BigInt(r.debitMinor)]));
}

type ProfileRow = Awaited<
  ReturnType<PrismaClient["holdingProfile"]["findMany"]>
>[number];

function secretView(profile: ProfileRow | undefined, ownerId: string) {
  if (!profile?.secretCipher) return { secretMasks: {}, secretsLocked: false };
  try {
    const secrets = openSecrets(
      profile.secretCipher,
      ownerId,
      profile.accountId,
    );
    return {
      secretMasks: Object.fromEntries(
        Object.entries(secrets).map(([k, v]) => [k, maskSecret(v)]),
      ),
      secretsLocked: false,
    };
  } catch {
    return { secretMasks: {}, secretsLocked: true };
  }
}

async function overview(
  database: PrismaClient,
  actor: Actor,
): Promise<WealthOverview> {
  const ownerId = actor.ownerId;
  const [accounts, profiles, sums, openings, workspaces] = await Promise.all([
    database.account.findMany({
      where: { ownerId, type: { in: ["ASSET", "LIABILITY"] } },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        type: true,
        kind: true,
        currencyCode: true,
        archivedAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    database.holdingProfile.findMany({ where: { ownerId } }),
    balances(database, ownerId),
    database.accountEvent.findMany({
      where: { ownerId, action: "CREATE_ACCOUNT" },
      select: { accountId: true, effectiveAt: true },
    }),
    database.workspace.findMany({
      where: { ownerId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const byId = new Map(profiles.map((p) => [p.accountId, p]));
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const opened = new Map(openings.map((o) => [o.accountId, o.effectiveAt]));
  const holdings: Holding[] = accounts.map((a) => {
    const p = byId.get(a.id);
    const signed = sums.get(a.id) ?? 0n;
    const category =
      (p && findCategory(p.category)?.id) ?? defaultCategory(a.kind).id;
    return {
      id: a.id,
      workspaceId: a.workspaceId,
      name: a.name,
      kind: a.kind,
      type: a.type as "ASSET" | "LIABILITY",
      currencyCode: a.currencyCode,
      archived: a.archivedAt !== null,
      balanceMinor: (a.type === "ASSET" ? signed : -signed).toString(),
      openedAt: (opened.get(a.id) ?? a.createdAt).toISOString(),
      category,
      hasProfile: !!p,
      institution: p?.institution ?? null,
      institutionKey: p?.institutionKey ?? null,
      platform: p?.platform ?? null,
      platformKey: p?.platformKey ?? null,
      fundingAccountId: p?.fundingAccountId ?? null,
      fundingAccountName: p?.fundingAccountId
        ? (names.get(p.fundingAccountId) ?? null)
        : null,
      details: (p?.details as Record<string, string> | undefined) ?? {},
      ...secretView(p, ownerId),
      notes: p?.notes ?? null,
      revision: p?.revision ?? null,
      updatedAt: p?.updatedAt.toISOString() ?? null,
    };
  });
  return {
    holdings,
    workspaces,
    vault: vaultConfigured(),
    asOf: new Date().toISOString(),
  };
}

async function ownedAccount(
  database: PrismaClient,
  ownerId: string,
  id: string,
) {
  if (!z.uuid().safeParse(id).success) throw new WealthError(404, "not_found");
  const account = await database.account.findFirst({
    where: { id, ownerId, type: { in: ["ASSET", "LIABILITY"] } },
    select: { id: true, workspaceId: true, kind: true },
  });
  if (!account) throw new WealthError(404, "not_found");
  return account;
}

async function saveProfile(
  database: PrismaClient,
  actor: Actor,
  id: string,
  body: unknown,
) {
  const account = await ownedAccount(database, actor.ownerId, id);
  const checked = validateProfile(body, account.kind);
  if (!checked.ok)
    throw new WealthError(400, "invalid_profile", checked.errors);
  const input = checked.value;
  if (input.fundingAccountId) {
    const funding = await database.account.findFirst({
      where: {
        id: input.fundingAccountId,
        ownerId: actor.ownerId,
        workspaceId: account.workspaceId,
        type: "ASSET",
        kind: { in: ["BANK", "CASH"] },
      },
      select: { id: true },
    });
    if (!funding || funding.id === account.id)
      throw new WealthError(400, "invalid_profile", {
        fundingAccountId: "Choose one of your bank or cash accounts.",
      });
  }
  await database.$transaction(
    async (tx) => {
      const existing = await tx.holdingProfile.findFirst({
        where: { accountId: account.id, ownerId: actor.ownerId },
      });
      if ((existing?.revision ?? null) !== input.revision)
        throw new WealthError(409, "stale_profile");
      let secretCipher = existing?.secretCipher ?? null;
      if (input.secrets) {
        const merged = {
          ...openSecrets(secretCipher, actor.ownerId, account.id),
          ...input.secrets,
        };
        for (const [k, v] of Object.entries(merged)) if (!v) delete merged[k];
        secretCipher = sealSecrets(merged, actor.ownerId, account.id);
      }
      const data = {
        category: input.category,
        institution: input.institution,
        institutionKey: input.institutionKey,
        platform: input.platform,
        platformKey: input.platformKey,
        fundingAccountId: input.fundingAccountId,
        details: input.details,
        secretCipher,
        notes: input.notes,
      };
      if (existing) {
        const updated = await tx.holdingProfile.updateMany({
          where: {
            accountId: account.id,
            ownerId: actor.ownerId,
            revision: existing.revision,
          },
          data: { ...data, revision: existing.revision + 1 },
        });
        if (updated.count !== 1) throw new WealthError(409, "stale_profile");
      } else
        await tx.holdingProfile.create({
          data: {
            ...data,
            accountId: account.id,
            workspaceId: account.workspaceId,
            ownerId: actor.ownerId,
          },
        });
      await tx.auditEvent.create({
        data: {
          ownerId: actor.ownerId,
          actorId: actor.ownerId,
          workspaceId: account.workspaceId,
          requestId: actor.requestId,
          action: existing
            ? "wealth.profile.updated"
            : "wealth.profile.created",
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
  const fresh = await overview(database, actor);
  return fresh.holdings.find((h) => h.id === account.id)!;
}

async function revealSecrets(database: PrismaClient, actor: Actor, id: string) {
  const account = await ownedAccount(database, actor.ownerId, id);
  const profile = await database.holdingProfile.findFirst({
    where: { accountId: account.id, ownerId: actor.ownerId },
    select: { secretCipher: true },
  });
  const secrets = openSecrets(
    profile?.secretCipher ?? null,
    actor.ownerId,
    account.id,
  );
  await database.auditEvent.create({
    data: {
      ownerId: actor.ownerId,
      actorId: actor.ownerId,
      workspaceId: account.workspaceId,
      requestId: actor.requestId,
      action: "wealth.secrets.revealed",
    },
  });
  return { secrets };
}

export async function wealthRequest(request: Request, id?: string) {
  const requestId = randomUUID();
  const started = performance.now();
  const respond = (body: unknown, status = 200) => {
    const response = authJSON(body, status);
    response.headers.set("X-Request-ID", requestId);
    try {
      console.info(
        JSON.stringify({
          requestId,
          route: id ? "wealth.holding" : "wealth",
          method: request.method,
          status,
          durationMs: Math.round(performance.now() - started),
        }),
      );
    } catch {
      /* Logging never changes a committed result. */
    }
    return response;
  };
  try {
    const runtime = getAuthRuntime();
    if (!runtime) throw new WealthError(503, "authentication_unavailable");
    const session = await getOwnerSession(
      runtime.auth,
      runtime.config,
      request.headers,
    );
    if (!session) throw new WealthError(401, "unauthorized");
    const actor = { ownerId: session.user.id, requestId };
    const database = getDatabase();
    if (request.method === "GET") {
      if (!id) return respond(await overview(database, actor));
      if (new URL(request.url).searchParams.get("reveal") === "1")
        return respond(await revealSecrets(database, actor, id));
      await ownedAccount(database, actor.ownerId, id);
      const holding = (await overview(database, actor)).holdings.find(
        (h) => h.id === id,
      );
      return respond(holding);
    }
    if (!id || request.method !== "PUT")
      throw new WealthError(405, "method_not_allowed");
    if (
      request.headers.get("origin") !== runtime.config.baseURL ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new WealthError(403, "forbidden");
    return respond(
      await saveProfile(database, actor, id, await readJSON(request)),
    );
  } catch (error) {
    if (error instanceof WealthError)
      return respond(
        {
          error: error.code,
          ...(error.fields ? { fields: error.fields } : {}),
        },
        error.status,
      );
    if (error instanceof VaultUnavailable)
      return respond({ error: "vault_unavailable" }, 503);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "P2034" || error.code === "40001")
    )
      return respond({ error: "stale_profile" }, 409);
    return respond({ error: "service_unavailable" }, 503);
  }
}
