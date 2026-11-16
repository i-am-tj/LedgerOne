-- S08-B typed movements. Existing migrations and runtime grants are unchanged.
BEGIN;
CREATE TABLE transaction_movement (
 "operationId" uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"ownerId" text NOT NULL,
 kind varchar(20) NOT NULL,"sourceAccountId" uuid NOT NULL,"destinationAccountId" uuid NOT NULL,
 "sourceAccountName" varchar(80) NOT NULL,"destinationAccountName" varchar(80) NOT NULL,"amountMinor" bigint NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT transaction_movement_kind CHECK(kind IN ('TRANSFER','CARD_SETTLEMENT')),
 CONSTRAINT transaction_movement_distinct CHECK("sourceAccountId"<>"destinationAccountId"),
 CONSTRAINT transaction_movement_amount CHECK("amountMinor">0 AND "amountMinor"<=999999999999999999),
 CONSTRAINT "transaction_movement_operationId_workspaceId_ownerId_fkey" FOREIGN KEY("operationId","workspaceId","ownerId") REFERENCES ledger_operation(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "transaction_movement_sourceAccountId_workspaceId_ownerId_fkey" FOREIGN KEY("sourceAccountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "movement_destination_scope_fkey" FOREIGN KEY("destinationAccountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "transaction_movement_ownerId_workspaceId_createdAt_idx" ON transaction_movement("ownerId","workspaceId","createdAt");
CREATE FUNCTION ledger08_movement_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE matches bigint;
BEGIN
 SELECT count(*) INTO matches FROM ledger_operation o JOIN journal j ON j."operationId"=o.id
 JOIN posting s ON s."journalId"=j.id AND s."accountId"=NEW."sourceAccountId"
 JOIN posting d ON d."journalId"=j.id AND d."accountId"=NEW."destinationAccountId"
 JOIN ledger_account a ON a.id=s."accountId" JOIN ledger_account b ON b.id=d."accountId"
 JOIN audit_event audit ON audit."operationId"=o.id AND audit."targetJournalId"=j.id
 WHERE o.id=NEW."operationId" AND o.kind='POST' AND o."ownerId"=NEW."ownerId" AND o."workspaceId"=NEW."workspaceId"
 AND j.kind='GENERAL' AND j.status='POSTED' AND audit.action='ledger.posted' AND audit."ownerId"=NEW."ownerId" AND audit."workspaceId"=NEW."workspaceId"
 AND (SELECT count(*) FROM posting WHERE "journalId"=j.id)=2
 AND s."nativeMinor"=NEW."amountMinor" AND d."nativeMinor"=NEW."amountMinor" AND s."currencyCode"='INR' AND d."currencyCode"='INR'
 AND s.side='CREDIT' AND d.side='DEBIT' AND a.type='ASSET' AND a.kind IN ('BANK','CASH')
 AND ((NEW.kind='TRANSFER' AND b.type='ASSET' AND b.kind IN ('BANK','CASH'))
   OR (NEW.kind='CARD_SETTLEMENT' AND b.type='LIABILITY' AND b.kind='CREDIT_CARD'
       -- B-R01: the proposed debit must fit at its instant AND every later
       -- posted boundary. Exclude its journal, then compare the pre-payment
       -- minimum with its amount, exactly as the typed admission check does.
       AND (WITH deltas AS (
              SELECT prior."effectiveAt" AS effective_at,
                     sum(CASE p.side WHEN 'CREDIT' THEN p."nativeMinor"::numeric ELSE -p."nativeMinor"::numeric END) AS delta
              FROM posting p JOIN journal prior ON prior.id=p."journalId" AND prior."ownerId"=p."ownerId" AND prior."workspaceId"=p."workspaceId"
              WHERE p."accountId"=b.id AND p."ownerId"=NEW."ownerId" AND p."workspaceId"=NEW."workspaceId"
                AND prior.status='POSTED' AND prior.id<>j.id
              GROUP BY prior."effectiveAt"
            ), timeline AS (
              SELECT effective_at, sum(delta) OVER (ORDER BY effective_at ROWS UNBOUNDED PRECEDING) AS balance FROM deltas
            ), relevant AS (
              SELECT coalesce(sum(delta),0) AS balance FROM deltas WHERE effective_at<=j."effectiveAt"
              UNION ALL
              SELECT balance FROM timeline WHERE effective_at>j."effectiveAt"
            ) SELECT min(balance) FROM relevant)>=NEW."amountMinor"));
 IF matches<>1 THEN RAISE EXCEPTION 'Movement must match scoped audited postings and supported account/payment rules' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER movement_valid_at_commit AFTER INSERT ON transaction_movement DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger08_movement_valid();
CREATE TRIGGER transaction_movement_immutable BEFORE UPDATE OR DELETE ON transaction_movement FOR EACH ROW EXECUTE FUNCTION ledger05_immutable();
CREATE TRIGGER transaction_movement_no_truncate BEFORE TRUNCATE ON transaction_movement FOR EACH STATEMENT EXECUTE FUNCTION ledger05_no_truncate();
DO $$ BEGIN EXECUTE format('ALTER FUNCTION ledger08_movement_valid() SET search_path=pg_catalog,%I,pg_temp',current_schema()); END $$;
UPDATE app_metadata SET value='11' WHERE key='schema_version';
COMMIT;
