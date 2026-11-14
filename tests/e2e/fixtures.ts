import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import { testDatabase } from "../support/database";
import { ensureE2EOwner } from "../support/e2e-owner";

export const test = base.extend<{
  ownerSession: { id: string; userId: string };
}>({
  ownerSession: [
    async ({ context }, use) => {
      const database = testDatabase();
      let sessionId: string | undefined;
      try {
        const user = await ensureE2EOwner(database);
        const token = randomBytes(32).toString("hex");
        const session = await database.authSession.create({
          data: {
            id: randomUUID(),
            token,
            userId: user.id,
            expiresAt: new Date(Date.now() + 8 * 3600000),
          },
        });
        sessionId = session.id;
        const secret = process.env.LEDGERONE_E2E_SECRET;
        if (!secret)
          throw new Error(
            "E2E auth secret was not initialized by the test config",
          );
        const signature = createHmac("sha256", secret)
          .update(token)
          .digest("base64");
        await context.addCookies([
          {
            name: "ledgerone.session_token",
            value: encodeURIComponent(`${token}.${signature}`),
            url: "http://127.0.0.1:3100",
            httpOnly: true,
            sameSite: "Lax",
            secure: false,
          },
        ]);
        await use({ id: session.id, userId: user.id });
      } finally {
        try {
          if (sessionId)
            await database.authSession.deleteMany({ where: { id: sessionId } });
        } finally {
          await database.$disconnect();
        }
      }
    },
    { auto: true },
  ],
});
export { expect };
