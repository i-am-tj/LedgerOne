import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";

// Fixture-only setup. The application still authenticates the resulting real
// session; this is never an application sign-in or provisioning entry point.
export async function ensureE2EOwner(
  database: PrismaClient,
  email = "e2e-owner@ledgerone.test",
) {
  if (
    process.env.LEDGERONE_ENV !== "test" ||
    !email.endsWith("@ledgerone.test")
  )
    throw new Error("Synthetic test owner required");
  const rows = await database.$queryRaw<{ id: string }[]>`
    INSERT INTO auth_user(id,email,"emailVerified",name,"createdAt","updatedAt")
    VALUES (${randomUUID()},${email},true,'Test owner',NOW(),NOW())
    ON CONFLICT (email) DO UPDATE SET "emailVerified"=EXCLUDED."emailVerified"
    RETURNING id
  `;
  if (rows.length !== 1) throw new Error("Test owner setup failed");
  return rows[0]!;
}
