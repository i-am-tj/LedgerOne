-- P1-S04: ownership container and append-only minimal audit; no financial schema.
CREATE TABLE "workspace" (
  "id" UUID PRIMARY KEY, "ownerId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workspace_name_length" CHECK (char_length(btrim("name")) BETWEEN 1 AND 80)
);
CREATE UNIQUE INDEX "workspace_ownerId_key" ON "workspace"("ownerId");
CREATE UNIQUE INDEX "workspace_id_ownerId_key" ON "workspace"("id", "ownerId");
CREATE TABLE "audit_event" (
  "id" UUID PRIMARY KEY, "ownerId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "workspaceId" UUID NOT NULL, "requestId" UUID NOT NULL, "action" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_event_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "audit_event_workspaceId_ownerId_fkey" FOREIGN KEY ("workspaceId", "ownerId") REFERENCES "workspace"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "audit_event_actor_owner" CHECK ("actorId" = "ownerId"),
  CONSTRAINT "audit_event_action" CHECK ("action" IN ('workspace.created', 'workspace.renamed'))
);
CREATE INDEX "audit_event_ownerId_occurredAt_id_idx" ON "audit_event"("ownerId", "occurredAt", "id");
CREATE INDEX "audit_event_requestId_idx" ON "audit_event"("requestId");
CREATE FUNCTION ledgerone_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON "audit_event" FOR EACH ROW EXECUTE FUNCTION ledgerone_audit_immutable();
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON "audit_event" FOR EACH STATEMENT EXECUTE FUNCTION ledgerone_audit_immutable();
CREATE FUNCTION ledgerone_workspace_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
    RAISE EXCEPTION 'Workspace ownership is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workspace_identity_immutable BEFORE UPDATE ON "workspace" FOR EACH ROW EXECUTE FUNCTION ledgerone_workspace_identity_immutable();
UPDATE "app_metadata" SET "value" = '3' WHERE "key" = 'schema_version';
