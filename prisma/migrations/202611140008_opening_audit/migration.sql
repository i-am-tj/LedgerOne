-- P1-S07: new OPENING audit contract, no runtime grants.
BEGIN;
ALTER TABLE audit_event DROP CONSTRAINT audit_event_action;
ALTER TABLE audit_event ADD CONSTRAINT audit_event_action CHECK (
 (action IN ('workspace.created','workspace.renamed') AND "operationId" IS NULL AND "targetJournalId" IS NULL AND reason IS NULL) OR
 (action IN ('ledger.posted','ledger.reversed','ledger.corrected','ledger.opened') AND "operationId" IS NOT NULL AND "targetJournalId" IS NOT NULL AND reason IS NOT NULL AND char_length(btrim(reason)) BETWEEN 1 AND 500));
CREATE OR REPLACE FUNCTION ledger06_audit_target() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op "ledger_operation"%ROWTYPE; expected_kind "LedgerOperationKind"; matches bigint;
BEGIN
 IF NEW."operationId" IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO op FROM "ledger_operation" WHERE "id"=NEW."operationId";
 expected_kind := CASE NEW."action" WHEN 'ledger.posted' THEN 'POST'::"LedgerOperationKind" WHEN 'ledger.reversed' THEN 'REVERSE'::"LedgerOperationKind" WHEN 'ledger.corrected' THEN 'CORRECT'::"LedgerOperationKind" WHEN 'ledger.opened' THEN 'OPENING'::"LedgerOperationKind" ELSE NULL END;
 IF NOT FOUND OR expected_kind IS NULL OR NEW."ownerId"<>op."ownerId" OR NEW."workspaceId"<>op."workspaceId" OR NEW."actorId"<>op."ownerId" OR op."kind"<>expected_kind THEN RAISE EXCEPTION 'Financial audit action must match operation' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO matches FROM "journal" j WHERE j."operationId"=op."id" AND j."status"='POSTED' AND
  ((op."kind"='OPENING' AND j."kind"='OPENING' AND j."id"=NEW."targetJournalId" AND EXISTS (
     SELECT 1 FROM opening_balance b WHERE b."journalId"=j.id AND b."ownerId"=op."ownerId" AND b."workspaceId"=op."workspaceId")) OR
   (op."kind"='POST' AND j."kind"='GENERAL' AND j."id"=NEW."targetJournalId") OR
   (op."kind" IN ('REVERSE','CORRECT') AND j."kind"='REVERSAL' AND j."reversesJournalId"=NEW."targetJournalId"));
 IF matches<>1 THEN RAISE EXCEPTION 'Financial audit must identify the exact posted command target' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;

-- INSERT-only registration preserves existing legacy receipts. Only OPENING is tightened.
CREATE FUNCTION ledger07_opening_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE matches bigint;
BEGIN
 IF NEW.kind <> 'OPENING' THEN RETURN NULL; END IF;
 SELECT count(*) INTO matches FROM audit_event a JOIN journal j
 ON j.id=a."targetJournalId" AND j."operationId"=NEW.id
 JOIN opening_balance b ON b."journalId"=j.id AND b."workspaceId"=NEW."workspaceId" AND b."ownerId"=NEW."ownerId"
 WHERE a."operationId"=NEW.id AND a."workspaceId"=NEW."workspaceId" AND a."ownerId"=NEW."ownerId"
 AND a."actorId"=NEW."ownerId" AND a.action='ledger.opened' AND j.kind='OPENING' AND j.status='POSTED';
 IF matches<>1 THEN RAISE EXCEPTION 'New opening requires its exact mandatory audit' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER opening_audit_at_commit AFTER INSERT ON ledger_operation
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger07_opening_audit();
DO $$ BEGIN
 EXECUTE format('ALTER FUNCTION ledger06_audit_target() SET search_path=pg_catalog,%I,pg_temp',current_schema());
 EXECUTE format('ALTER FUNCTION ledger07_opening_audit() SET search_path=pg_catalog,%I,pg_temp',current_schema());
END $$;
UPDATE app_metadata SET value='8' WHERE key='schema_version';
COMMIT;
