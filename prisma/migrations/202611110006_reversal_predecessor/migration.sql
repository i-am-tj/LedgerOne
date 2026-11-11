-- P1-S05: a reversal must reference an already posted predecessor, not a
-- mutually posted cycle that only becomes valid at deferred-check time.
BEGIN;
CREATE OR REPLACE FUNCTION ledger05_journal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor "JournalStatus";
BEGIN
 IF TG_OP <> 'INSERT' THEN
  IF OLD."status" = 'POSTED' THEN RAISE EXCEPTION 'Posted journal is immutable; use a reversal' USING ERRCODE='23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF ROW(NEW."id",NEW."workspaceId",NEW."ownerId",NEW."functionalCurrencyCode",NEW."createdAt")
     IS DISTINCT FROM ROW(OLD."id",OLD."workspaceId",OLD."ownerId",OLD."functionalCurrencyCode",OLD."createdAt") THEN
   RAISE EXCEPTION 'Journal scope/identity is immutable' USING ERRCODE='23514';
  END IF;
 ELSIF NEW."status" <> 'DRAFT' THEN
  RAISE EXCEPTION 'Create a draft before posting' USING ERRCODE='23514';
 END IF;
 IF NEW."kind"='REVERSAL' THEN
  SELECT "status" INTO predecessor FROM "journal" WHERE "id"=NEW."reversesJournalId" FOR SHARE;
  IF NOT FOUND OR predecessor<>'POSTED' THEN
   RAISE EXCEPTION 'Reversal predecessor must already be posted' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
DO $$ BEGIN
 EXECUTE format('ALTER FUNCTION ledger05_journal_guard() SET search_path = pg_catalog, %I, pg_temp',current_schema());
END $$;
UPDATE "app_metadata" SET "value"='6' WHERE "key"='schema_version';
COMMIT;
