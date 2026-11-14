-- S08-A immutable typed capture context. No runtime grants or generic exposure.
BEGIN;
CREATE TABLE transaction_record (
 "operationId" uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"ownerId" text NOT NULL,
 kind varchar(12) NOT NULL,"accountId" uuid NOT NULL,"categoryAccountId" uuid NOT NULL,
 "accountName" varchar(80) NOT NULL,"categoryName" varchar(80) NOT NULL,"amountMinor" bigint NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT transaction_record_kind CHECK(kind IN ('EXPENSE','INCOME')),
 CONSTRAINT transaction_record_amount CHECK("amountMinor">0 AND "amountMinor"<=999999999999999999),
 CONSTRAINT "transaction_record_operationId_workspaceId_ownerId_fkey" FOREIGN KEY("operationId","workspaceId","ownerId") REFERENCES ledger_operation(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "transaction_record_accountId_workspaceId_ownerId_fkey" FOREIGN KEY("accountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "transaction_record_categoryAccountId_workspaceId_ownerId_fkey" FOREIGN KEY("categoryAccountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "transaction_record_ownerId_workspaceId_createdAt_idx" ON transaction_record("ownerId","workspaceId","createdAt");
CREATE FUNCTION ledger08_capture_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE matches bigint;
BEGIN
 SELECT count(*) INTO matches FROM ledger_operation o JOIN journal j ON j."operationId"=o.id
 JOIN posting p ON p."journalId"=j.id AND p."accountId"=NEW."accountId"
 JOIN posting c ON c."journalId"=j.id AND c."accountId"=NEW."categoryAccountId"
 JOIN ledger_account a ON a.id=p."accountId" JOIN ledger_account k ON k.id=c."accountId"
 JOIN audit_event audit ON audit."operationId"=o.id AND audit."targetJournalId"=j.id
 WHERE o.id=NEW."operationId" AND o.kind='POST' AND o."ownerId"=NEW."ownerId" AND o."workspaceId"=NEW."workspaceId"
 AND j.kind='GENERAL' AND j.status='POSTED' AND audit.action='ledger.posted' AND audit."ownerId"=NEW."ownerId" AND audit."workspaceId"=NEW."workspaceId"
 AND (SELECT count(*) FROM posting WHERE "journalId"=j.id)=2
 AND p."nativeMinor"=NEW."amountMinor" AND c."nativeMinor"=NEW."amountMinor" AND p."currencyCode"='INR' AND c."currencyCode"='INR'
 AND ((NEW.kind='EXPENSE' AND p.side='CREDIT' AND c.side='DEBIT' AND k.type='EXPENSE' AND k.kind='EXPENSE'
       AND ((a.type='ASSET' AND a.kind IN ('BANK','CASH')) OR (a.type='LIABILITY' AND a.kind='CREDIT_CARD')))
   OR (NEW.kind='INCOME' AND p.side='DEBIT' AND c.side='CREDIT' AND k.type='INCOME' AND k.kind='INCOME' AND a.type='ASSET' AND a.kind IN ('BANK','CASH')));
 IF matches<>1 THEN RAISE EXCEPTION 'Typed transaction must match its scoped balanced audited outcome' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER capture_valid_at_commit AFTER INSERT ON transaction_record DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger08_capture_valid();
CREATE TRIGGER transaction_record_immutable BEFORE UPDATE OR DELETE ON transaction_record FOR EACH ROW EXECUTE FUNCTION ledger05_immutable();
CREATE TRIGGER transaction_record_no_truncate BEFORE TRUNCATE ON transaction_record FOR EACH STATEMENT EXECUTE FUNCTION ledger05_no_truncate();
DO $$ BEGIN EXECUTE format('ALTER FUNCTION ledger08_capture_valid() SET search_path=pg_catalog,%I,pg_temp',current_schema()); END $$;
UPDATE app_metadata SET value='10' WHERE key='schema_version';
COMMIT;
