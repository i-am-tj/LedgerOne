import "server-only";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
export type Actor = Readonly<{ ownerId: string; requestId: string }>;
export class AccessError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409,
    public readonly code: string,
  ) {
    super(code);
  }
}
const command = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const workspaceFields = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;
function owner(actor: Actor) {
  if (!actor.ownerId?.trim()) throw new AccessError(401, "unauthorized");
  return actor.ownerId;
}
function input(value: unknown) {
  const parsed = command.safeParse(value);
  if (!parsed.success) throw new AccessError(400, "invalid_request");
  return parsed.data;
}
function identifier(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AccessError(404, "not_found");
  return id;
}
export function listWorkspaces(database: PrismaClient, actor: Actor) {
  return database.workspace.findMany({
    where: { ownerId: owner(actor) },
    select: workspaceFields,
  });
}
export async function readWorkspace(
  database: PrismaClient,
  actor: Actor,
  id: string,
) {
  const row = await database.workspace.findFirst({
    where: { id: identifier(id), ownerId: owner(actor) },
    select: workspaceFields,
  });
  if (!row) throw new AccessError(404, "not_found");
  return row;
}
export async function createWorkspace(
  database: PrismaClient,
  actor: Actor,
  value: unknown,
) {
  const ownerId = owner(actor);
  const data = input(value);
  try {
    return await database.$transaction(async (tx) => {
      const row = await tx.workspace.create({
        data: { ...data, ownerId },
        select: workspaceFields,
      });
      await tx.auditEvent.create({
        data: {
          ownerId,
          actorId: ownerId,
          workspaceId: row.id,
          requestId: actor.requestId,
          action: "workspace.created",
        },
      });
      return row;
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    )
      throw new AccessError(409, "workspace_exists");
    throw error;
  }
}
export async function renameWorkspace(
  database: PrismaClient,
  actor: Actor,
  id: string,
  value: unknown,
) {
  const ownerId = owner(actor);
  const name = input(value).name;
  identifier(id);
  return database.$transaction(async (tx) => {
    const result = await tx.workspace.updateMany({
      where: { id, ownerId },
      data: { name },
    });
    if (result.count !== 1) throw new AccessError(404, "not_found");
    await tx.auditEvent.create({
      data: {
        ownerId,
        actorId: ownerId,
        workspaceId: id,
        requestId: actor.requestId,
        action: "workspace.renamed",
      },
    });
    return tx.workspace.findFirstOrThrow({
      where: { id, ownerId },
      select: workspaceFields,
    });
  });
}
export function listAudit(database: PrismaClient, actor: Actor) {
  return database.auditEvent.findMany({
    where: { ownerId: owner(actor) },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      id: true,
      workspaceId: true,
      requestId: true,
      action: true,
      occurredAt: true,
    },
  });
}
