-- P1-S06A / A05-02: additive command audit contracts; no runtime write grant.
BEGIN;
ALTER TABLE "audit_event"
 ADD COLUMN "operationId" uuid,
 ADD COLUMN "targetJournalId" uuid,
 ADD COLUMN "reason" varchar(500);
ALTER TABLE "audit_event" DROP CONSTRAINT "audit_event_action";
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_action" CHECK (
 ("action" IN ('workspace.created','workspace.renamed') AND "operationId" IS NULL AND "targetJournalId" IS NULL AND "reason" IS NULL) OR
 ("action" IN ('ledger.posted','ledger.reversed','ledger.corrected') AND "operationId" IS NOT NULL AND "targetJournalId" IS NOT NULL AND "reason" IS NOT NULL AND char_length(btrim("reason")) BETWEEN 1 AND 500));
CREATE UNIQUE INDEX "audit_event_operationId_workspaceId_ownerId_key" ON "audit_event"("operationId","workspaceId","ownerId");
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_operationId_workspaceId_ownerId_fkey" FOREIGN KEY ("operationId","workspaceId","ownerId") REFERENCES "ledger_operation"("id","workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_targetJournalId_workspaceId_ownerId_fkey" FOREIGN KEY ("targetJournalId","workspaceId","ownerId") REFERENCES "journal"("id","workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE OR REPLACE FUNCTION ledger05_assert_operation(oid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE op "ledger_operation"%ROWTYPE; total bigint; posted bigint; generals bigint; openings bigint; reversals bigint;
BEGIN
 SELECT * INTO op FROM "ledger_operation" WHERE "id" = oid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Operation receipt missing' USING ERRCODE = '23514'; END IF;
 SELECT count(*),count(*) FILTER(WHERE "status"='POSTED'),count(*) FILTER(WHERE "kind"='GENERAL'),count(*) FILTER(WHERE "kind"='OPENING'),count(*) FILTER(WHERE "kind"='REVERSAL')
 INTO total,posted,generals,openings,reversals FROM "journal" WHERE "operationId"=oid;
 IF total <> posted OR NOT (
  (op."kind"='POST' AND total=1 AND generals=1) OR
  (op."kind"='OPENING' AND total=1 AND openings=1) OR
  (op."kind"='REVERSE' AND total=1 AND reversals=1) OR
  (op."kind"='CORRECT' AND total=2 AND reversals=1 AND generals=1)) THEN
  RAISE EXCEPTION 'Operation must commit its posted outcome atomically' USING ERRCODE = '23514';
 END IF;
 IF op."kind"='CORRECT' AND EXISTS (
  SELECT 1 FROM "journal" r JOIN "journal" original ON original."id"=r."reversesJournalId"
  WHERE r."operationId"=oid AND r."kind"='REVERSAL' AND original."operationId"=oid
 ) THEN RAISE EXCEPTION 'Correction must target an original outside its replacement operation' USING ERRCODE='23514'; END IF;
END; $$;

-- Validate the financial meaning of an inserted audit at commit, after journal sealing.
-- Legacy operations remain valid: this does not claim that all SQL fixtures/old
-- receipts were audited. S06B must insert audit atomically for every command.
CREATE FUNCTION ledger06_audit_target() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op "ledger_operation"%ROWTYPE; expected_kind "LedgerOperationKind"; matches bigint;
BEGIN
 IF NEW."operationId" IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO op FROM "ledger_operation" WHERE "id"=NEW."operationId";
 expected_kind := CASE NEW."action" WHEN 'ledger.posted' THEN 'POST'::"LedgerOperationKind" WHEN 'ledger.reversed' THEN 'REVERSE'::"LedgerOperationKind" ELSE 'CORRECT'::"LedgerOperationKind" END;
 IF NOT FOUND OR op."kind"<>expected_kind THEN RAISE EXCEPTION 'Financial audit action must match operation' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO matches FROM "journal" j WHERE j."operationId"=op."id" AND j."status"='POSTED' AND
  ((op."kind"='POST' AND j."kind"='GENERAL' AND j."id"=NEW."targetJournalId") OR
   (op."kind" IN ('REVERSE','CORRECT') AND j."kind"='REVERSAL' AND j."reversesJournalId"=NEW."targetJournalId"));
 IF matches<>1 THEN RAISE EXCEPTION 'Financial audit must identify the exact posted command target' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER financial_audit_target_at_commit AFTER INSERT ON "audit_event" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger06_audit_target();
DO $$ BEGIN
 EXECUTE format('ALTER FUNCTION ledger05_assert_operation(uuid) SET search_path = pg_catalog, %I, pg_temp',current_schema());
 EXECUTE format('ALTER FUNCTION ledger06_audit_target() SET search_path = pg_catalog, %I, pg_temp',current_schema());
END $$;
UPDATE "app_metadata" SET "value"='7' WHERE "key"='schema_version';
COMMIT;
