import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "../../src/lib/auth/create-auth";
import {
  ownedRequest,
  type Route,
  type Trace,
} from "../../src/lib/ownership/http";
import {
  createWorkspace,
  renameWorkspace,
  listWorkspaces,
} from "../../src/lib/ownership/service";
import { testDatabase } from "../support/database";
const database = testDatabase();
const suffix = randomUUID();
const secret = randomUUID() + randomUUID();
const emails = [
  `scope-a-${suffix}@ledgerone.test`,
  `scope-b-${suffix}@ledgerone.test`,
];
const config = {
  baseURL: "http://localhost:3199",
  secret,
  googleClientId: "test-client",
  googleClientSecret: "test-secret",
  allowedEmails: new Set(emails),
};
const runtime = { config, auth: createAuth(config, database) };
const users = [randomUUID(), randomUUID()];
const cookies: string[] = [];
const traces: Trace[] = [];
let workspaceA = "",
  workspaceB = "";
async function api(
  who: number | null,
  method: string,
  route: Route,
  id?: string,
  data?: unknown,
  extra: Record<string, string> = {},
) {
  const path =
    route === "audit.list"
      ? "/api/audit"
      : route === "workspace.item"
        ? `/api/workspaces/${id}`
        : "/api/workspaces";
  return ownedRequest(
    new Request(config.baseURL + path, {
      method,
      headers: {
        origin: config.baseURL,
        "content-type": "application/json",
        ...(who === null ? {} : { cookie: cookies[who]! }),
        ...extra,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    route,
    id,
    runtime,
    database,
    (t) => traces.push(t),
  );
}
beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    await database.user.create({
      data: {
        id: users[i]!,
        email: emails[i]!,
        name: "Scope test",
        emailVerified: true,
      },
    });
    const token = randomUUID() + randomUUID();
    await database.authSession.create({
      data: {
        id: randomUUID(),
        userId: users[i]!,
        token,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    cookies.push(
      `ledgerone.session_token=${encodeURIComponent(token + "." + createHmac("sha256", secret).update(token).digest("base64"))}`,
    );
  }
});
afterAll(async () => {
  // Audit history is append-only. Keep audited test users/workspaces in this
  // disposable *_test database; never disable triggers to clean fixtures.
  await database.authSession.deleteMany({ where: { userId: { in: users } } });
  await database.$disconnect();
});
describe("P1-S04 two authenticated users and actual owned resources", () => {
  it("creates owner-derived workspaces and atomic audit with a server request ID", async () => {
    for (const i of [0, 1]) {
      const response = await api(
        i,
        "POST",
        "workspace.collection",
        undefined,
        { name: i === 0 ? "Alpha private" : "Beta private" },
        { "x-request-id": "attacker-secret" },
      );
      expect(response.status).toBe(201);
      const row = await response.json();
      if (i === 0) workspaceA = row.id;
      else workspaceB = row.id;
      expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
      const audit = await database.auditEvent.findFirstOrThrow({
        where: { workspaceId: row.id },
      });
      expect(audit.ownerId).toBe(users[i]);
      expect(audit.actorId).toBe(users[i]);
      expect(audit.requestId).toBe(response.headers.get("x-request-id"));
      expect(audit.action).toBe("workspace.created");
    }
  });
  it("scopes lists, direct reads, and audit to each user", async () => {
    for (const i of [0, 1]) {
      const own = i === 0 ? workspaceA : workspaceB;
      const other = i === 0 ? workspaceB : workspaceA;
      expect(
        (await (await api(i, "GET", "workspace.collection")).json()).map(
          (w: { id: string }) => w.id,
        ),
      ).toEqual([own]);
      expect((await api(i, "GET", "workspace.item", own)).status).toBe(200);
      const denied = await api(i, "GET", "workspace.item", other);
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual({ error: "not_found" });
      const missing = await api(i, "GET", "workspace.item", randomUUID());
      expect(await missing.json()).toEqual({ error: "not_found" });
      const audit = await (await api(i, "GET", "audit.list")).json();
      expect(
        audit.every(
          (event: { workspaceId: string }) => event.workspaceId === own,
        ),
      ).toBe(true);
    }
  });
  it("denies guessed-ID writes without changing business rows or audit", async () => {
    const before = await database.workspace.findUniqueOrThrow({
      where: { id: workspaceB },
    });
    const count = await database.auditEvent.count({
      where: { workspaceId: workspaceB },
    });
    const result = await api(0, "PATCH", "workspace.item", workspaceB, {
      name: "stolen",
    });
    expect(result.status).toBe(404);
    expect(
      await database.workspace.findUniqueOrThrow({ where: { id: workspaceB } }),
    ).toEqual(before);
    expect(
      await database.auditEvent.count({ where: { workspaceId: workspaceB } }),
    ).toBe(count);
  });
  it("rejects owner injection, anonymous, CSRF and malformed commands without DB effects", async () => {
    const count = await database.auditEvent.count({
      where: { workspaceId: workspaceA },
    });
    expect(
      (
        await api(0, "PATCH", "workspace.item", workspaceA, {
          name: "injected",
          ownerId: users[1],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(null, "PATCH", "workspace.item", workspaceA, {
          name: "anonymous",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await api(
          0,
          "PATCH",
          "workspace.item",
          workspaceA,
          { name: "csrf" },
          { origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await api(0, "PATCH", "workspace.item", workspaceA, {
          name: "x".repeat(3000),
        })
      ).status,
    ).toBe(400);
    expect(
      await database.auditEvent.count({ where: { workspaceId: workspaceA } }),
    ).toBe(count);
    expect(
      (
        await database.workspace.findUniqueOrThrow({
          where: { id: workspaceA },
        })
      ).name,
    ).toBe("Alpha private");
  });
  it("records successful update and returns a bounded private audit DTO", async () => {
    const response = await api(0, "PATCH", "workspace.item", workspaceA, {
      name: "Alpha renamed",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe("Alpha renamed");
    const rows = await (await api(0, "GET", "audit.list")).json();
    expect(rows).toHaveLength(2);
    expect(rows[0].action).toBe("workspace.renamed");
    expect(rows[0]).not.toHaveProperty("ownerId");
    expect(rows[0]).not.toHaveProperty("name");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rolls the business insert back if its audit write fails", async () => {
    const user = await database.user.create({
      data: {
        id: randomUUID(),
        name: "Rollback",
        email: `rollback-${suffix}@ledgerone.test`,
        emailVerified: true,
      },
    });
    try {
      await expect(
        createWorkspace(
          database,
          { ownerId: user.id, requestId: "invalid-uuid" },
          { name: "Must roll back" },
        ),
      ).rejects.toThrow();
      expect(
        await database.workspace.count({ where: { ownerId: user.id } }),
      ).toBe(0);
      expect(
        await database.auditEvent.count({ where: { ownerId: user.id } }),
      ).toBe(0);
    } finally {
      await database.user.delete({ where: { id: user.id } });
    }
  });
  it("enforces audit scope/immutability and fixed ownership in PostgreSQL", async () => {
    const audit = await database.auditEvent.findFirstOrThrow({
      where: { workspaceId: workspaceA },
    });
    await expect(
      database.auditEvent.update({
        where: { id: audit.id },
        data: { action: "workspace.renamed" },
      }),
    ).rejects.toThrow();
    await expect(
      database.auditEvent.delete({ where: { id: audit.id } }),
    ).rejects.toThrow();
    await expect(
      database.workspace.update({
        where: { id: workspaceA },
        data: { ownerId: users[1] },
      }),
    ).rejects.toThrow();
    await expect(
      database.auditEvent.create({
        data: {
          ownerId: users[0]!,
          actorId: users[0]!,
          workspaceId: workspaceB,
          requestId: randomUUID(),
          action: "workspace.renamed",
        },
      }),
    ).rejects.toThrow();
    await expect(
      database.auditEvent.create({
        data: {
          ownerId: users[0]!,
          actorId: users[1]!,
          workspaceId: workspaceA,
          requestId: randomUUID(),
          action: "workspace.renamed",
        },
      }),
    ).rejects.toThrow();
  });
  it("logs only fixed trace metadata, never supplied secrets or identifiers", () => {
    expect(traces.length).toBeGreaterThan(0);
    const text = JSON.stringify(traces);
    for (const value of [
      "attacker-secret",
      "Alpha private",
      "Beta private",
      workspaceA,
      workspaceB,
      ...users,
      ...emails,
      ...cookies,
    ])
      expect(text).not.toContain(value);
    for (const trace of traces)
      expect(Object.keys(trace).sort()).toEqual([
        "durationMs",
        "method",
        "requestId",
        "route",
        "status",
      ]);
  });
  it("rejects a missing owner context before querying", () => {
    expect(() =>
      listWorkspaces(database, { ownerId: "", requestId: randomUUID() }),
    ).toThrow("unauthorized");
  });
  it("rolls a rename back when its audit write cannot persist", async () => {
    const before = await database.workspace.findUniqueOrThrow({
      where: { id: workspaceA },
    });
    const count = await database.auditEvent.count({
      where: { workspaceId: workspaceA },
    });
    await expect(
      renameWorkspace(
        database,
        { ownerId: users[0]!, requestId: "bad-uuid" },
        workspaceA,
        { name: "Must not stick" },
      ),
    ).rejects.toThrow();
    expect(
      await database.workspace.findUniqueOrThrow({ where: { id: workspaceA } }),
    ).toEqual(before);
    expect(
      await database.auditEvent.count({ where: { workspaceId: workspaceA } }),
    ).toBe(count);
  });
});
