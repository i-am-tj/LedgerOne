-- S08-C: immutable business context; no published runtime grants or old migration edits.
BEGIN;
CREATE TABLE transaction_capital (
 "operationId" uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"ownerId" text NOT NULL,
 kind varchar(20) NOT NULL,"sourceAccountId" uuid NOT NULL,"destinationAccountId" uuid NOT NULL,
 "sourceAccountName" varchar(80) NOT NULL,"destinationAccountName" varchar(80) NOT NULL,
 "interestAccountId" uuid,"interestAccountName" varchar(80),
 "principalMinor" bigint NOT NULL,"interestMinor" bigint NOT NULL,"amountMinor" bigint NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT capital_kind CHECK(kind IN ('FD_FUNDING','FD_RETURN','LOAN_REPAYMENT')),
 CONSTRAINT capital_distinct CHECK("sourceAccountId"<>"destinationAccountId" AND ("interestAccountId" IS NULL OR "interestAccountId" NOT IN ("sourceAccountId","destinationAccountId"))),
 CONSTRAINT capital_amounts CHECK("principalMinor">0 AND "principalMinor"<=999999999999999999 AND "interestMinor">=0 AND "interestMinor"<=999999999999999999 AND "amountMinor">0 AND "amountMinor"<=999999999999999999 AND "amountMinor"::numeric="principalMinor"::numeric+"interestMinor"::numeric),
 CONSTRAINT capital_interest CHECK(("interestMinor"=0 AND "interestAccountId" IS NULL AND "interestAccountName" IS NULL) OR (kind='LOAN_REPAYMENT' AND "interestMinor">0 AND "interestAccountId" IS NOT NULL AND "interestAccountName" IS NOT NULL)),
 CONSTRAINT capital_operation_scope_fkey FOREIGN KEY("operationId","workspaceId","ownerId") REFERENCES ledger_operation(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT capital_source_scope_fkey FOREIGN KEY("sourceAccountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT capital_destination_scope_fkey FOREIGN KEY("destinationAccountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT capital_interest_scope_fkey FOREIGN KEY("interestAccountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "transaction_capital_ownerId_workspaceId_createdAt_idx" ON transaction_capital("ownerId","workspaceId","createdAt");
CREATE FUNCTION ledger08_capital_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE matches bigint;
BEGIN
 SELECT count(*) INTO matches FROM ledger_operation o JOIN journal j ON j."operationId"=o.id
 JOIN posting s ON s."journalId"=j.id AND s."accountId"=NEW."sourceAccountId"
 JOIN posting d ON d."journalId"=j.id AND d."accountId"=NEW."destinationAccountId"
 JOIN ledger_account a ON a.id=s."accountId" JOIN ledger_account b ON b.id=d."accountId"
 LEFT JOIN posting ip ON ip."journalId"=j.id AND ip."accountId"=NEW."interestAccountId"
 LEFT JOIN ledger_account expense ON expense.id=ip."accountId"
 JOIN audit_event audit ON audit."operationId"=o.id AND audit."targetJournalId"=j.id
 WHERE o.id=NEW."operationId" AND o.kind='POST' AND o."ownerId"=NEW."ownerId" AND o."workspaceId"=NEW."workspaceId"
 AND j.kind='GENERAL' AND j.status='POSTED' AND audit.action='ledger.posted' AND audit."ownerId"=NEW."ownerId" AND audit."workspaceId"=NEW."workspaceId"
 AND (SELECT count(*) FROM posting WHERE "journalId"=j.id)=CASE WHEN NEW."interestMinor">0 THEN 3 ELSE 2 END
 AND s.side='CREDIT' AND d.side='DEBIT' AND s."nativeMinor"=NEW."amountMinor" AND d."nativeMinor"=NEW."principalMinor" AND s."currencyCode"='INR' AND d."currencyCode"='INR'
 AND (NEW."interestMinor"=0 OR (ip.side='DEBIT' AND ip."nativeMinor"=NEW."interestMinor" AND ip."currencyCode"='INR' AND expense.type='EXPENSE' AND expense.kind='EXPENSE'))
 AND ((NEW.kind='FD_FUNDING' AND a.type='ASSET' AND a.kind IN ('BANK','CASH') AND b.type='ASSET' AND b.kind='FIXED_DEPOSIT')
   OR (NEW.kind='FD_RETURN' AND a.type='ASSET' AND a.kind='FIXED_DEPOSIT' AND b.type='ASSET' AND b.kind IN ('BANK','CASH'))
   OR (NEW.kind='LOAN_REPAYMENT' AND a.type='ASSET' AND a.kind IN ('BANK','CASH') AND b.type='LIABILITY' AND b.kind='LOAN'))
 AND (NEW.kind='FD_FUNDING' OR (WITH deltas AS (
   SELECT prior."effectiveAt" effective_at,
     sum(CASE WHEN p.side::text=CASE NEW.kind WHEN 'FD_RETURN' THEN 'DEBIT' ELSE 'CREDIT' END THEN p."nativeMinor"::numeric ELSE -p."nativeMinor"::numeric END) delta
   FROM posting p JOIN journal prior ON prior.id=p."journalId" AND prior."ownerId"=p."ownerId" AND prior."workspaceId"=p."workspaceId"
   WHERE p."ownerId"=NEW."ownerId" AND p."workspaceId"=NEW."workspaceId"
     AND p."accountId"=CASE NEW.kind WHEN 'FD_RETURN' THEN NEW."sourceAccountId" ELSE NEW."destinationAccountId" END
     AND prior.status='POSTED' AND prior.id<>j.id GROUP BY prior."effectiveAt"
 ),timeline AS (SELECT effective_at,sum(delta) OVER(ORDER BY effective_at ROWS UNBOUNDED PRECEDING) balance FROM deltas),relevant AS (
   SELECT coalesce(sum(delta),0) balance FROM deltas WHERE effective_at<=j."effectiveAt"
   UNION ALL SELECT balance FROM timeline WHERE effective_at>j."effectiveAt"
 ) SELECT min(balance) FROM relevant)>=NEW."principalMinor");
 IF matches<>1 THEN RAISE EXCEPTION 'Capital transaction must match exact scoped balanced audited business postings' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER capital_valid_at_commit AFTER INSERT ON transaction_capital DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger08_capital_valid();
CREATE TRIGGER transaction_capital_immutable BEFORE UPDATE OR DELETE ON transaction_capital FOR EACH ROW EXECUTE FUNCTION ledger05_immutable();
CREATE TRIGGER transaction_capital_no_truncate BEFORE TRUNCATE ON transaction_capital FOR EACH STATEMENT EXECUTE FUNCTION ledger05_no_truncate();
DO $$ BEGIN EXECUTE format('ALTER FUNCTION ledger08_capital_valid() SET search_path=pg_catalog,%I,pg_temp',current_schema()); END $$;
UPDATE app_metadata SET value='12' WHERE key='schema_version';
COMMIT;
