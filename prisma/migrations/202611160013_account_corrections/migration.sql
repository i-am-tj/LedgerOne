-- S07: scoped correction admission, no production DML grants; 001–012 unchanged.
BEGIN;
CREATE TABLE account_correction (
 "operationId" UUID PRIMARY KEY,
 "workspaceId" UUID NOT NULL,"ownerId" TEXT NOT NULL,"accountId" UUID NOT NULL,
 "originalJournalId" UUID NOT NULL,"rootJournalId" UUID NOT NULL,
 "reversalJournalId" UUID,"replacementJournalId" UUID,
 mode VARCHAR(8) NOT NULL,"amountMinor" NUMERIC(18,0) NOT NULL,
 "commandHash" CHAR(64) NOT NULL,"effectiveAt" TIMESTAMPTZ(3) NOT NULL,
 "replacementEffectiveAt" TIMESTAMPTZ(3) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT account_correction_shape CHECK(mode IN ('OPENING','ENTRY') AND (mode='OPENING' OR "amountMinor">=0) AND ("reversalJournalId" IS NOT NULL OR "replacementJournalId" IS NOT NULL) AND "reversalJournalId" IS DISTINCT FROM "replacementJournalId"),
 CONSTRAINT "account_correction_operationId_workspaceId_ownerId_fkey" FOREIGN KEY("operationId","workspaceId","ownerId") REFERENCES ledger_operation(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "account_correction_accountId_workspaceId_ownerId_fkey" FOREIGN KEY("accountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "account_correction_originalJournalId_workspaceId_ownerId_fkey" FOREIGN KEY("originalJournalId","workspaceId","ownerId") REFERENCES journal(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "account_correction_rootJournalId_workspaceId_ownerId_fkey" FOREIGN KEY("rootJournalId","workspaceId","ownerId") REFERENCES journal(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "account_correction_operationId_workspaceId_ownerId_key" ON account_correction("operationId","workspaceId","ownerId");
CREATE UNIQUE INDEX "account_correction_originalJournalId_workspaceId_ownerId_key" ON account_correction("originalJournalId","workspaceId","ownerId");
CREATE INDEX "account_correction_accountId_workspaceId_ownerId_idx" ON account_correction("accountId","workspaceId","ownerId");
CREATE FUNCTION ledger07_correction_root(jid uuid, wid uuid, uid text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE j journal%ROWTYPE; node uuid:=jid; visited uuid[]:=ARRAY[]::uuid[]; opkind "LedgerOperationKind";
BEGIN
 LOOP
  IF node=ANY(visited) OR cardinality(visited)>=128 THEN RETURN NULL; END IF;
  visited:=array_append(visited,node);
  SELECT * INTO j FROM journal WHERE id=node AND "workspaceId"=wid AND "ownerId"=uid AND status='POSTED';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT kind INTO opkind FROM ledger_operation WHERE id=j."operationId" AND "workspaceId"=wid AND "ownerId"=uid;
  IF j.kind='OPENING' AND opkind='OPENING' AND EXISTS(SELECT 1 FROM opening_balance WHERE "journalId"=node AND "workspaceId"=wid AND "ownerId"=uid) THEN RETURN node;
  ELSIF j.kind='REVERSAL' THEN node:=j."reversesJournalId";
  ELSIF j.kind='GENERAL' AND opkind='CORRECT' THEN
   SELECT "reversesJournalId" INTO node FROM journal WHERE "operationId"=j."operationId" AND kind='REVERSAL' AND status='POSTED' AND "workspaceId"=wid AND "ownerId"=uid;
  ELSIF j.kind='GENERAL' AND opkind='POST' THEN
   IF EXISTS(SELECT 1 FROM transaction_record WHERE "operationId"=j."operationId" AND "workspaceId"=wid AND "ownerId"=uid AND kind IN ('EXPENSE','INCOME')) THEN RETURN node; END IF;
   SELECT "originalJournalId" INTO node FROM account_correction WHERE "operationId"=j."operationId" AND "workspaceId"=wid AND "ownerId"=uid;
  ELSE RETURN NULL; END IF;
  IF node IS NULL THEN RETURN NULL; END IF;
 END LOOP;
END; $$;
CREATE FUNCTION ledger07_archived_correction(jid uuid,aid uuid) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 IF NOT has_table_privilege(current_user,'account_correction','SELECT') THEN RETURN FALSE; END IF;
 RETURN EXISTS(SELECT 1 FROM account_correction c JOIN journal j ON j.id=jid AND j."workspaceId"=c."workspaceId" AND j."ownerId"=c."ownerId"
 JOIN ledger_operation o ON o.id=c."operationId" AND o."workspaceId"=c."workspaceId" AND o."ownerId"=c."ownerId" AND o."requestHash"=c."commandHash"
 WHERE (j.id=c."reversalJournalId" AND j.kind='REVERSAL' AND j."reversesJournalId"=c."originalJournalId" OR j.id=c."replacementJournalId" AND j.kind='GENERAL' AND j."reversesJournalId" IS NULL)
 AND ledger07_correction_root(c."originalJournalId",c."workspaceId",c."ownerId")=c."rootJournalId"
 AND EXISTS(SELECT 1 FROM posting WHERE "journalId"=c."originalJournalId" AND "accountId"=aid));
END; $$;
CREATE FUNCTION ledger07_correction_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c account_correction%ROWTYPE:=NEW; o ledger_operation%ROWTYPE; original journal%ROWTYPE; repl journal%ROWTYPE; physical ledger_account%ROWTYPE; counterpart uuid; physical_side text; expected_kind text; n bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM transaction_record WHERE "operationId"=c."operationId") OR EXISTS(SELECT 1 FROM transaction_movement WHERE "operationId"=c."operationId") OR EXISTS(SELECT 1 FROM transaction_capital WHERE "operationId"=c."operationId") THEN RAISE EXCEPTION 'Correction cannot acquire another business capture' USING ERRCODE='23514'; END IF;
 SELECT * INTO o FROM ledger_operation WHERE id=c."operationId";
 SELECT * INTO original FROM journal WHERE id=c."originalJournalId";
 SELECT * INTO physical FROM ledger_account WHERE id=c."accountId";
 IF o."ownerId"<>c."ownerId" OR o."workspaceId"<>c."workspaceId" OR o."requestHash"<>c."commandHash" OR physical."currencyCode"<>'INR' OR physical.type NOT IN ('ASSET','LIABILITY') OR original.status<>'POSTED' OR ledger07_correction_root(original.id,c."workspaceId",c."ownerId") IS DISTINCT FROM c."rootJournalId" THEN RAISE EXCEPTION 'Invalid scoped correction evidence' USING ERRCODE='23514'; END IF;
 IF c.mode='OPENING' THEN
  IF NOT EXISTS(SELECT 1 FROM opening_balance WHERE "journalId"=c."rootJournalId" AND "accountId"=c."accountId" AND "workspaceId"=c."workspaceId" AND "ownerId"=c."ownerId") THEN RAISE EXCEPTION 'Opening root must retain its original marker' USING ERRCODE='23514'; END IF;
  SELECT p."accountId" INTO counterpart FROM posting p JOIN ledger_account a ON a.id=p."accountId" WHERE p."journalId"=c."rootJournalId" AND a.kind='OPENING_EQUITY';
  physical_side:=CASE WHEN (physical.type='ASSET')=(c."amountMinor">0) THEN 'DEBIT' ELSE 'CREDIT' END;
 ELSE
  SELECT r."categoryAccountId" INTO counterpart FROM transaction_record r JOIN journal j ON j."operationId"=r."operationId" WHERE j.id=c."rootJournalId" AND r."accountId"=c."accountId" AND r."ownerId"=c."ownerId" AND r."workspaceId"=c."workspaceId" AND r.kind IN ('EXPENSE','INCOME');
  SELECT side::text INTO physical_side FROM posting WHERE "journalId"=c."rootJournalId" AND "accountId"=c."accountId";
 END IF;
 IF counterpart IS NULL OR counterpart=c."accountId" OR (SELECT count(*) FROM posting WHERE "journalId"=original.id)<>2 OR EXISTS(SELECT 1 FROM posting WHERE "journalId"=original.id AND "accountId" NOT IN (c."accountId",counterpart)) THEN RAISE EXCEPTION 'Correction cannot change original accounts or classification' USING ERRCODE='23514'; END IF;
 IF original.kind='REVERSAL' THEN
  IF NOT EXISTS(SELECT 1 FROM account_correction prior JOIN ledger_operation po ON po.id=prior."operationId" WHERE prior."operationId"=original."operationId" AND prior."amountMinor"=0 AND prior."rootJournalId"=c."rootJournalId" AND po.kind='REVERSE') OR c."amountMinor"=0 OR EXISTS(SELECT 1 FROM journal WHERE "reversesJournalId"=original.id) THEN RAISE EXCEPTION 'Only an exact zero correction can be resumed' USING ERRCODE='23514'; END IF;
  expected_kind:='POST';
 ELSE expected_kind:=CASE WHEN c."amountMinor"=0 THEN 'REVERSE' ELSE 'CORRECT' END; END IF;
 IF o.kind::text<>expected_kind OR (expected_kind='POST')<>(c."reversalJournalId" IS NULL) OR (expected_kind='REVERSE')<>(c."replacementJournalId" IS NULL) THEN RAISE EXCEPTION 'Wrong correction receipt or child identity' USING ERRCODE='23514'; END IF;
 IF c."reversalJournalId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM journal j WHERE j.id=c."reversalJournalId" AND j."operationId"=o.id AND j.kind='REVERSAL' AND j.status='POSTED' AND j."reversesJournalId"=original.id AND j."effectiveAt"=c."effectiveAt") THEN RAISE EXCEPTION 'Correction must reverse exact original' USING ERRCODE='23514'; END IF;
 IF c."replacementJournalId" IS NOT NULL THEN
  SELECT * INTO repl FROM journal WHERE id=c."replacementJournalId";
  IF NOT FOUND OR repl."operationId" IS DISTINCT FROM o.id OR repl.kind<>'GENERAL' OR repl.status<>'POSTED' OR repl."effectiveAt"<>c."replacementEffectiveAt" THEN RAISE EXCEPTION 'Invalid replacement identity' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO n FROM posting WHERE "journalId"=repl.id AND "currencyCode"='INR' AND "nativeMinor"=abs(c."amountMinor") AND "functionalMinor"="nativeMinor" AND (("accountId"=c."accountId" AND side::text=physical_side) OR ("accountId"=counterpart AND side::text<>physical_side));
  IF n<>2 OR (SELECT count(*) FROM posting WHERE "journalId"=repl.id)<>2 OR (SELECT count(DISTINCT "accountId") FROM posting WHERE "journalId"=repl.id)<>2 THEN RAISE EXCEPTION 'Replacement must match exact signed correction amount' USING ERRCODE='23514'; END IF;
 END IF;
 IF (SELECT count(*) FROM audit_event WHERE "operationId"=o.id AND "ownerId"=c."ownerId" AND "workspaceId"=c."workspaceId" AND "actorId"=c."ownerId" AND action=CASE expected_kind WHEN 'POST' THEN 'ledger.posted' WHEN 'REVERSE' THEN 'ledger.reversed' ELSE 'ledger.corrected' END AND "targetJournalId"=CASE expected_kind WHEN 'POST' THEN repl.id ELSE original.id END)<>1 THEN RAISE EXCEPTION 'Correction requires exact immutable audit' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER account_correction_valid_at_commit AFTER INSERT ON account_correction DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger07_correction_valid();
CREATE TRIGGER account_correction_immutable BEFORE UPDATE OR DELETE ON account_correction FOR EACH ROW EXECUTE FUNCTION ledger05_immutable();
CREATE TRIGGER account_correction_no_truncate BEFORE TRUNCATE ON account_correction FOR EACH STATEMENT EXECUTE FUNCTION ledger05_no_truncate();
-- A zero-to-nonzero continuation is not another purchase. Guard later capture
-- insertion as well as correction insertion in either statement order.
CREATE FUNCTION ledger07_no_correction_capture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM account_correction WHERE "operationId"=NEW."operationId") THEN RAISE EXCEPTION 'Correction cannot acquire another business capture' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER transaction_record_no_correction_at_commit AFTER INSERT ON transaction_record DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger07_no_correction_capture();
CREATE CONSTRAINT TRIGGER transaction_movement_no_correction_at_commit AFTER INSERT ON transaction_movement DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger07_no_correction_capture();
CREATE CONSTRAINT TRIGGER transaction_capital_no_correction_at_commit AFTER INSERT ON transaction_capital DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger07_no_correction_capture();
CREATE OR REPLACE FUNCTION ledger05_touch_draft() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid uuid; aid uuid; archived timestamptz;
BEGIN
 IF TG_OP = 'UPDATE' AND ROW(NEW."id",NEW."journalId",NEW."workspaceId",NEW."ownerId") IS DISTINCT FROM ROW(OLD."id",OLD."journalId",OLD."workspaceId",OLD."ownerId") THEN
  RAISE EXCEPTION 'Posting/marker identity cannot move' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'DELETE' THEN jid := OLD."journalId"; ELSE jid := NEW."journalId"; END IF;
 UPDATE "journal" SET "revision" = "revision" + 1 WHERE "id" = jid AND "status" = 'DRAFT';
 IF NOT FOUND THEN RAISE EXCEPTION 'Only an existing draft can be edited' USING ERRCODE = '23514'; END IF;
 IF TG_TABLE_NAME = 'posting' AND TG_OP <> 'DELETE' THEN
  aid := NEW."accountId";
  SELECT "archivedAt" INTO archived FROM "ledger_account" WHERE "id" = aid FOR SHARE;
  IF NOT FOUND OR (archived IS NOT NULL AND NOT ledger07_archived_correction(jid,aid)) THEN RAISE EXCEPTION 'Account is missing or archived' USING ERRCODE = '23514'; END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION ledger05_assert_journal(jid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j "journal"%ROWTYPE; a "ledger_account"%ROWTYPE; original "journal"%ROWTYPE; marker "opening_balance"%ROWTYPE;
 legs bigint; debits numeric; credits numeric; bad boolean;
BEGIN
 SELECT * INTO j FROM "journal" WHERE "id"=jid;
 IF NOT FOUND OR j."status"='DRAFT' THEN RETURN; END IF;
 SELECT count(*),coalesce(sum("functionalMinor") FILTER(WHERE "side"='DEBIT'),0),coalesce(sum("functionalMinor") FILTER(WHERE "side"='CREDIT'),0)
 INTO legs,debits,credits FROM "posting" WHERE "journalId"=jid;
 IF legs < 2 OR legs > 500 OR debits=0 OR debits<>credits THEN RAISE EXCEPTION 'Journal must have 2..500 balanced positive legs' USING ERRCODE = '23514'; END IF;
 FOR a IN SELECT * FROM "ledger_account" WHERE "id" IN (SELECT "accountId" FROM "posting" WHERE "journalId"=jid) ORDER BY "id" FOR SHARE LOOP
  IF a."archivedAt" IS NOT NULL AND NOT ledger07_archived_correction(jid,a.id) THEN RAISE EXCEPTION 'Cannot post to archived account' USING ERRCODE = '23514'; END IF;
 END LOOP;
 PERFORM ledger05_assert_operation(j."operationId");
 IF j."kind"='OPENING' THEN
  SELECT * INTO marker FROM "opening_balance" WHERE "journalId"=jid;
  IF NOT FOUND OR legs<>2 THEN RAISE EXCEPTION 'Opening journal requires one provenance marker and two legs' USING ERRCODE='23514'; END IF;
  SELECT * INTO a FROM "ledger_account" WHERE "id"=marker."accountId";
  IF a."type" NOT IN ('ASSET','LIABILITY') OR (SELECT count(*) FROM "posting" WHERE "journalId"=jid AND "accountId"=marker."accountId")<>1 OR
     (SELECT count(*) FROM "posting" p JOIN "ledger_account" e ON e."id"=p."accountId" WHERE p."journalId"=jid AND e."kind"='OPENING_EQUITY')<>1 THEN
   RAISE EXCEPTION 'Opening counterpart must be opening equity' USING ERRCODE='23514';
  END IF;
 ELSIF EXISTS(SELECT 1 FROM "opening_balance" WHERE "journalId"=jid) THEN
  RAISE EXCEPTION 'Opening marker on non-opening journal' USING ERRCODE='23514';
 END IF;
 IF j."kind"='REVERSAL' THEN
  SELECT * INTO original FROM "journal" WHERE "id"=j."reversesJournalId";
  IF NOT FOUND OR original."status"<>'POSTED' THEN RAISE EXCEPTION 'Only posted journals can be reversed' USING ERRCODE='23514'; END IF;
  SELECT EXISTS(
   (SELECT "accountId","currencyCode","nativeMinor","functionalMinor","fxRateId", "side"::text FROM "posting" WHERE "journalId"=original."id"
    EXCEPT ALL SELECT "accountId","currencyCode","nativeMinor","functionalMinor","fxRateId", CASE "side" WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END FROM "posting" WHERE "journalId"=jid)
   UNION ALL
   (SELECT "accountId","currencyCode","nativeMinor","functionalMinor","fxRateId", CASE "side" WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END FROM "posting" WHERE "journalId"=jid
    EXCEPT ALL SELECT "accountId","currencyCode","nativeMinor","functionalMinor","fxRateId","side"::text FROM "posting" WHERE "journalId"=original."id")
  ) INTO bad;
  IF bad THEN RAISE EXCEPTION 'Reversal must exactly negate the original posting multiset' USING ERRCODE='23514'; END IF;
 END IF;
END; $$;
DO $$ DECLARE f text; BEGIN FOREACH f IN ARRAY ARRAY['ledger07_no_correction_capture()','ledger07_correction_root(uuid,uuid,text)','ledger07_archived_correction(uuid,uuid)','ledger07_correction_valid()','ledger05_touch_draft()','ledger05_assert_journal(uuid)'] LOOP EXECUTE format('ALTER FUNCTION %s SET search_path=pg_catalog,%I,pg_temp',f,current_schema()); END LOOP; END $$;
UPDATE app_metadata SET value='13' WHERE key='schema_version';
COMMIT;
