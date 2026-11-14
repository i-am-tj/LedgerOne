-- S07 typed lifecycle receipts and immutable metadata/reconciliation history.
BEGIN;
CREATE TABLE account_command (
 id uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, "ownerId" text NOT NULL, "accountId" uuid NOT NULL,
 "idempotencyKey" varchar(128) NOT NULL, "requestHash" char(64) NOT NULL,
 result jsonb NOT NULL, "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "account_command_accountId_workspaceId_ownerId_fkey" FOREIGN KEY ("accountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "account_command_id_workspaceId_ownerId_key" ON account_command(id,"workspaceId","ownerId");
CREATE UNIQUE INDEX "account_command_workspaceId_ownerId_idempotencyKey_key" ON account_command("workspaceId","ownerId","idempotencyKey");
CREATE TABLE account_event (
 id uuid PRIMARY KEY, "requestId" uuid NOT NULL, "commandId" uuid NOT NULL, "workspaceId" uuid NOT NULL, "ownerId" text NOT NULL,
 "accountId" uuid NOT NULL, "actorId" text NOT NULL, action varchar(32) NOT NULL, data jsonb NOT NULL,
 "effectiveAt" timestamptz(3) NOT NULL, "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT account_event_actor CHECK ("actorId"="ownerId"),
 CONSTRAINT account_event_action CHECK (action IN ('CREATE_ACCOUNT','RENAME_ACCOUNT','ARCHIVE_ACCOUNT','RESTORE_ACCOUNT','RECONCILE_ACCOUNT')),
 CONSTRAINT "account_event_commandId_workspaceId_ownerId_fkey" FOREIGN KEY ("commandId","workspaceId","ownerId") REFERENCES account_command(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "account_event_accountId_workspaceId_ownerId_fkey" FOREIGN KEY ("accountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "account_event_commandId_key" ON account_event("commandId");
CREATE INDEX "account_event_ownerId_accountId_createdAt_idx" ON account_event("ownerId","accountId","createdAt");
CREATE FUNCTION ledger07_account_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM account_event e WHERE e."commandId"=NEW.id AND e."accountId"=NEW."accountId" AND e."ownerId"=NEW."ownerId" AND e."workspaceId"=NEW."workspaceId" AND e.data=NEW.result AND e.action=NEW.result->>'kind' AND NEW.result->>'accountId'=NEW."accountId"::text)
 THEN RAISE EXCEPTION 'Account command requires scoped immutable audit' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER account_event_at_commit AFTER INSERT ON account_command DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger07_account_event();
CREATE TRIGGER account_command_immutable BEFORE UPDATE OR DELETE ON account_command FOR EACH ROW EXECUTE FUNCTION ledger05_immutable();
CREATE TRIGGER account_event_immutable BEFORE UPDATE OR DELETE ON account_event FOR EACH ROW EXECUTE FUNCTION ledger05_immutable();
CREATE TRIGGER account_command_no_truncate BEFORE TRUNCATE ON account_command FOR EACH STATEMENT EXECUTE FUNCTION ledger05_no_truncate();
CREATE TRIGGER account_event_no_truncate BEFORE TRUNCATE ON account_event FOR EACH STATEMENT EXECUTE FUNCTION ledger05_no_truncate();
DO $$ BEGIN EXECUTE format('ALTER FUNCTION ledger07_account_event() SET search_path=pg_catalog,%I,pg_temp',current_schema()); END $$;
UPDATE app_metadata SET value='9' WHERE key='schema_version';
COMMIT;
