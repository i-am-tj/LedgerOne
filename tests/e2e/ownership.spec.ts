import { createHmac, randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { testDatabase } from "../support/database";
test("P1-S04 two allowed users cannot read/write one another's workspace or audit", async ({
  page,
  playwright,
  ownerSession,
}) => {
  const database = testDatabase();
  const origin = "http://127.0.0.1:3100";
  const other = await database.user.upsert({
    where: { email: "e2e-other@ledgerone.test" },
    update: {},
    create: {
      id: randomUUID(),
      email: "e2e-other@ledgerone.test",
      emailVerified: true,
      name: "Other test owner",
    },
  });
  const token = randomUUID() + randomUUID();
  const row = await database.authSession.create({
    data: {
      id: randomUUID(),
      userId: other.id,
      token,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const signature = createHmac("sha256", process.env.LEDGERONE_E2E_SECRET!)
    .update(token)
    .digest("base64");
  const second = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: {
      cookie: `ledgerone.session_token=${encodeURIComponent(token + "." + signature)}`,
      origin,
    },
  });
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try {
    expect((await page.request.get("/api/session")).status()).toBe(200);
    expect((await second.get("/api/session")).status()).toBe(200);
    const ownRows = await (await page.request.get("/api/workspaces")).json();
    let own = ownRows[0];
    if (!own) {
      const created = await page.request.post("/api/workspaces", {
        headers: { origin },
        data: { name: "Owner workspace" },
      });
      expect(created.status()).toBe(201);
      own = await created.json();
    }
    const otherRows = await (await second.get("/api/workspaces")).json();
    let foreign = otherRows[0];
    if (!foreign) {
      const created = await second.post("/api/workspaces", {
        data: { name: "Other workspace" },
      });
      expect(created.status()).toBe(201);
      foreign = await created.json();
    }
    expect(own.id).not.toBe(foreign.id);
    const auditBefore = await (await second.get("/api/audit")).json();
    const denied = await page.request.patch(`/api/workspaces/${foreign.id}`, {
      headers: { origin, "x-request-id": "spoofed" },
      data: { name: "Unauthorized rename" },
    });
    expect(denied.status()).toBe(404);
    expect(denied.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      (await page.request.get(`/api/workspaces/${foreign.id}`)).status(),
    ).toBe(404);
    expect((await second.get(`/api/workspaces/${own.id}`)).status()).toBe(404);
    expect(await (await second.get("/api/audit")).json()).toEqual(auditBefore);
    const ownAudit = await (await page.request.get("/api/audit")).json();
    expect(
      ownAudit.every(
        (event: { workspaceId: string }) => event.workspaceId === own.id,
      ),
    ).toBe(true);
    for (const path of [
      "/api/workspaces",
      "/api/audit",
      `/api/workspaces/${own.id}`,
    ])
      expect((await anonymous.get(path)).status()).toBe(401);
    expect(
      (
        await page.request.post("/api/workspaces", {
          headers: { origin },
          data: { name: "bad", ownerId: other.id },
        })
      ).status(),
    ).toBe(400);
    expect(
      (await database.workspace.findUniqueOrThrow({ where: { id: own.id } }))
        .ownerId,
    ).toBe(ownerSession.userId);
  } finally {
    await second.dispose();
    await anonymous.dispose();
    await database.authSession.deleteMany({ where: { id: row.id } });
    await database.$disconnect();
  }
});
