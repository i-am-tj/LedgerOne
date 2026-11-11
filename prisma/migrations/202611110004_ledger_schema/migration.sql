-- P1-S05: additive, transactional owned ledger foundation.
BEGIN;
-- CreateEnum
CREATE TYPE "AccountClass" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('CASH', 'BANK', 'FIXED_DEPOSIT', 'INVESTMENT', 'RECEIVABLE', 'OTHER_ASSET', 'CREDIT_CARD', 'LOAN', 'OTHER_LIABILITY', 'INCOME', 'FX_GAIN', 'EXPENSE', 'FX_LOSS', 'ROUNDING', 'OPENING_EQUITY', 'OTHER_EQUITY');

-- CreateEnum
CREATE TYPE "PostingSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "JournalKind" AS ENUM ('GENERAL', 'OPENING', 'REVERSAL');

-- CreateEnum
CREATE TYPE "LedgerOperationKind" AS ENUM ('POST', 'OPENING', 'REVERSE', 'CORRECT');

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "functionalCurrencyCode" VARCHAR(3) NOT NULL DEFAULT 'INR';

-- CreateTable
CREATE TABLE "currency" (
    "code" VARCHAR(3) NOT NULL,
    "scale" SMALLINT NOT NULL,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ledger_account" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "type" "AccountClass" NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ledger_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_operation" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "kind" "LedgerOperationKind" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "functionalCurrencyCode" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "kind" "JournalKind" NOT NULL DEFAULT 'GENERAL',
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "operationId" UUID,
    "reversesJournalId" UUID,

    CONSTRAINT "journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rate" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nativeCurrencyCode" VARCHAR(3) NOT NULL,
    "functionalCurrencyCode" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "quote" DECIMAL(38,18) NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "source" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posting" (
    "id" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "functionalCurrencyCode" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "side" "PostingSide" NOT NULL,
    "nativeMinor" BIGINT NOT NULL,
    "functionalMinor" BIGINT NOT NULL,
    "fxRateId" UUID,

    CONSTRAINT "posting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balance" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "source" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_balance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_account_ownerId_workspaceId_archivedAt_idx" ON "ledger_account"("ownerId", "workspaceId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_account_id_workspaceId_ownerId_key" ON "ledger_account"("id", "workspaceId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_account_id_workspaceId_ownerId_currencyCode_key" ON "ledger_account"("id", "workspaceId", "ownerId", "currencyCode");

-- CreateIndex
CREATE INDEX "ledger_operation_ownerId_createdAt_idx" ON "ledger_operation"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_operation_id_workspaceId_ownerId_key" ON "ledger_operation"("id", "workspaceId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_operation_workspaceId_ownerId_idempotencyKey_key" ON "ledger_operation"("workspaceId", "ownerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "journal_ownerId_workspaceId_status_effectiveAt_id_idx" ON "journal"("ownerId", "workspaceId", "status", "effectiveAt", "id");

-- CreateIndex
CREATE INDEX "journal_operationId_workspaceId_ownerId_idx" ON "journal"("operationId", "workspaceId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_id_workspaceId_ownerId_key" ON "journal"("id", "workspaceId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_id_workspaceId_ownerId_functionalCurrencyCode_key" ON "journal"("id", "workspaceId", "ownerId", "functionalCurrencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "journal_reversesJournalId_workspaceId_ownerId_key" ON "journal"("reversesJournalId", "workspaceId", "ownerId");

-- CreateIndex
CREATE INDEX "fx_rate_ownerId_workspaceId_nativeCurrencyCode_effectiveAt_idx" ON "fx_rate"("ownerId", "workspaceId", "nativeCurrencyCode", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "fx_rate_owned_currency_key" ON "fx_rate"("id", "workspaceId", "ownerId", "nativeCurrencyCode", "functionalCurrencyCode");

-- CreateIndex
CREATE INDEX "posting_journalId_workspaceId_ownerId_idx" ON "posting"("journalId", "workspaceId", "ownerId");

-- CreateIndex
CREATE INDEX "posting_ownerId_accountId_journalId_idx" ON "posting"("ownerId", "accountId", "journalId");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_accountId_workspaceId_ownerId_key" ON "opening_balance"("accountId", "workspaceId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_journalId_workspaceId_ownerId_key" ON "opening_balance"("journalId", "workspaceId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_id_ownerId_functionalCurrencyCode_key" ON "workspace"("id", "ownerId", "functionalCurrencyCode");

INSERT INTO "currency" ("code", "scale") VALUES
 ('INR', 2), ('USD', 2), ('EUR', 2), ('GBP', 2), ('JPY', 0), ('KWD', 3);

-- AddForeignKey
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_functionalCurrencyCode_fkey" FOREIGN KEY ("functionalCurrencyCode") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_workspaceId_ownerId_fkey" FOREIGN KEY ("workspaceId", "ownerId") REFERENCES "workspace"("id", "ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ledger_operation" ADD CONSTRAINT "ledger_operation_workspaceId_ownerId_fkey" FOREIGN KEY ("workspaceId", "ownerId") REFERENCES "workspace"("id", "ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_workspaceId_ownerId_functionalCurrencyCode_fkey" FOREIGN KEY ("workspaceId", "ownerId", "functionalCurrencyCode") REFERENCES "workspace"("id", "ownerId", "functionalCurrencyCode") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_operationId_workspaceId_ownerId_fkey" FOREIGN KEY ("operationId", "workspaceId", "ownerId") REFERENCES "ledger_operation"("id", "workspaceId", "ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_reversesJournalId_workspaceId_ownerId_fkey" FOREIGN KEY ("reversesJournalId", "workspaceId", "ownerId") REFERENCES "journal"("id", "workspaceId", "ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fx_rate" ADD CONSTRAINT "fx_rate_workspaceId_ownerId_fkey" FOREIGN KEY ("workspaceId", "ownerId") REFERENCES "workspace"("id", "ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fx_rate" ADD CONSTRAINT "fx_rate_nativeCurrencyCode_fkey" FOREIGN KEY ("nativeCurrencyCode") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fx_rate" ADD CONSTRAINT "fx_rate_functionalCurrencyCode_fkey" FOREIGN KEY ("functionalCurrencyCode") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting" ADD CONSTRAINT "posting_journalId_workspaceId_ownerId_functionalCurrencyCo_fkey" FOREIGN KEY ("journalId", "workspaceId", "ownerId", "functionalCurrencyCode") REFERENCES "journal"("id", "workspaceId", "ownerId", "functionalCurrencyCode") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting" ADD CONSTRAINT "posting_accountId_workspaceId_ownerId_currencyCode_fkey" FOREIGN KEY ("accountId", "workspaceId", "ownerId", "currencyCode") REFERENCES "ledger_account"("id", "workspaceId", "ownerId", "currencyCode") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting" ADD CONSTRAINT "posting_fxRateId_workspaceId_ownerId_currencyCode_function_fkey" FOREIGN KEY ("fxRateId", "workspaceId", "ownerId", "currencyCode", "functionalCurrencyCode") REFERENCES "fx_rate"("id", "workspaceId", "ownerId", "nativeCurrencyCode", "functionalCurrencyCode") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_accountId_workspaceId_ownerId_fkey" FOREIGN KEY ("accountId", "workspaceId", "ownerId") REFERENCES "ledger_account"("id", "workspaceId", "ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_journalId_workspaceId_ownerId_fkey" FOREIGN KEY ("journalId", "workspaceId", "ownerId") REFERENCES "journal"("id", "workspaceId", "ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- P1-S05 release-blocking constraints. Amounts are positive minor units.
ALTER TABLE "currency" ADD CONSTRAINT "currency_supported_scale" CHECK (
 ("code" IN ('INR','USD','EUR','GBP') AND "scale" = 2) OR
 ("code" = 'JPY' AND "scale" = 0) OR ("code" = 'KWD' AND "scale" = 3));
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_functional_inr" CHECK ("functionalCurrencyCode" = 'INR');
ALTER TABLE "ledger_account" ADD CONSTRAINT "account_name_valid" CHECK (char_length(btrim("name")) BETWEEN 1 AND 80);
ALTER TABLE "ledger_account" ADD CONSTRAINT "account_kind_class" CHECK (
 ("kind" IN ('CASH','BANK','FIXED_DEPOSIT','INVESTMENT','RECEIVABLE','OTHER_ASSET') AND "type" = 'ASSET') OR
 ("kind" IN ('CREDIT_CARD','LOAN','OTHER_LIABILITY') AND "type" = 'LIABILITY') OR
 ("kind" IN ('INCOME','FX_GAIN') AND "type" = 'INCOME') OR
 ("kind" IN ('EXPENSE','FX_LOSS','ROUNDING') AND "type" = 'EXPENSE') OR
 ("kind" IN ('OPENING_EQUITY','OTHER_EQUITY') AND "type" = 'EQUITY'));
ALTER TABLE "ledger_account" ADD CONSTRAINT "account_nominal_inr" CHECK ("type" IN ('ASSET','LIABILITY') OR "currencyCode" = 'INR');
ALTER TABLE "ledger_operation" ADD CONSTRAINT "operation_key_valid" CHECK ("idempotencyKey" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$');
ALTER TABLE "ledger_operation" ADD CONSTRAINT "operation_hash_valid" CHECK ("requestHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "journal" ADD CONSTRAINT "journal_lifecycle" CHECK (
 ("status" = 'DRAFT' AND "postedAt" IS NULL AND "operationId" IS NULL) OR
 ("status" = 'POSTED' AND "postedAt" IS NOT NULL AND "operationId" IS NOT NULL));
ALTER TABLE "journal" ADD CONSTRAINT "journal_reversal_link" CHECK (("kind" = 'REVERSAL') = ("reversesJournalId" IS NOT NULL) AND "id" IS DISTINCT FROM "reversesJournalId");
ALTER TABLE "journal" ADD CONSTRAINT "journal_revision_nonnegative" CHECK ("revision" >= 0);
ALTER TABLE "posting" ADD CONSTRAINT "posting_positive_bounded" CHECK (
 "nativeMinor" BETWEEN 1 AND 999999999999999999 AND "functionalMinor" BETWEEN 1 AND 999999999999999999);
-- Deliberate reviewed stage: never pretend unsupported FX rounding works.
ALTER TABLE "posting" ADD CONSTRAINT "posting_fx_not_enabled" CHECK (
 "currencyCode" = 'INR' AND "functionalCurrencyCode" = 'INR' AND "nativeMinor" = "functionalMinor" AND "fxRateId" IS NULL);
ALTER TABLE "fx_rate" ADD CONSTRAINT "fx_rate_manual_quote" CHECK (
 "nativeCurrencyCode" <> 'INR' AND "functionalCurrencyCode" = 'INR' AND
 "quote" > 0 AND "quote" < 1000000000000 AND "quote" <> 'NaN'::numeric AND
 char_length(btrim("source")) BETWEEN 1 AND 160);
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_source_valid" CHECK (char_length(btrim("source")) BETWEEN 1 AND 160);

CREATE FUNCTION ledger05_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Ledger evidence is immutable' USING ERRCODE = '23514'; END;
$$;
CREATE FUNCTION ledger05_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Ledger truncation is prohibited' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER currency_immutable BEFORE UPDATE OR DELETE ON "currency" FOR EACH ROW EXECUTE FUNCTION ledger05_immutable();
CREATE TRIGGER fx_rate_immutable BEFORE UPDATE OR DELETE ON "fx_rate" FOR EACH ROW EXECUTE FUNCTION ledger05_immutable();
CREATE TRIGGER operation_immutable BEFORE UPDATE OR DELETE ON "ledger_operation" FOR EACH ROW EXECUTE FUNCTION ledger05_immutable();
CREATE FUNCTION ledger05_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."id",NEW."workspaceId",NEW."ownerId",NEW."type",NEW."kind",NEW."currencyCode",NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."id",OLD."workspaceId",OLD."ownerId",OLD."type",OLD."kind",OLD."currencyCode",OLD."createdAt") THEN
  RAISE EXCEPTION 'Account identity/class/currency is immutable' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER account_identity_immutable BEFORE UPDATE ON "ledger_account" FOR EACH ROW EXECUTE FUNCTION ledger05_account_identity();
CREATE FUNCTION ledger05_journal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW."status" <> 'DRAFT' THEN RAISE EXCEPTION 'Create a draft before posting' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
 END IF;
 IF OLD."status" = 'POSTED' THEN RAISE EXCEPTION 'Posted journal is immutable; use a reversal' USING ERRCODE = '23514'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 IF ROW(NEW."id",NEW."workspaceId",NEW."ownerId",NEW."functionalCurrencyCode",NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."id",OLD."workspaceId",OLD."ownerId",OLD."functionalCurrencyCode",OLD."createdAt") THEN
  RAISE EXCEPTION 'Journal scope/identity is immutable' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER journal_guard BEFORE INSERT OR UPDATE OR DELETE ON "journal" FOR EACH ROW EXECUTE FUNCTION ledger05_journal_guard();

-- A write to the parent (not a lock alone) detects stale repeatable-read snapshots.
CREATE FUNCTION ledger05_touch_draft() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NOT FOUND OR archived IS NOT NULL THEN RAISE EXCEPTION 'Account is missing or archived' USING ERRCODE = '23514'; END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER posting_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON "posting" FOR EACH ROW EXECUTE FUNCTION ledger05_touch_draft();
CREATE TRIGGER opening_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON "opening_balance" FOR EACH ROW EXECUTE FUNCTION ledger05_touch_draft();

CREATE FUNCTION ledger05_assert_operation(oid uuid) RETURNS void LANGUAGE plpgsql AS $$
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
END; $$;
CREATE FUNCTION ledger05_assert_journal(jid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j "journal"%ROWTYPE; a "ledger_account"%ROWTYPE; original "journal"%ROWTYPE; marker "opening_balance"%ROWTYPE;
 legs bigint; debits numeric; credits numeric; bad boolean;
BEGIN
 SELECT * INTO j FROM "journal" WHERE "id"=jid;
 IF NOT FOUND OR j."status"='DRAFT' THEN RETURN; END IF;
 SELECT count(*),coalesce(sum("functionalMinor") FILTER(WHERE "side"='DEBIT'),0),coalesce(sum("functionalMinor") FILTER(WHERE "side"='CREDIT'),0)
 INTO legs,debits,credits FROM "posting" WHERE "journalId"=jid;
 IF legs < 2 OR legs > 500 OR debits=0 OR debits<>credits THEN RAISE EXCEPTION 'Journal must have 2..500 balanced positive legs' USING ERRCODE = '23514'; END IF;
 FOR a IN SELECT * FROM "ledger_account" WHERE "id" IN (SELECT "accountId" FROM "posting" WHERE "journalId"=jid) ORDER BY "id" FOR SHARE LOOP
  IF a."archivedAt" IS NOT NULL THEN RAISE EXCEPTION 'Cannot post to archived account' USING ERRCODE = '23514'; END IF;
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
CREATE FUNCTION ledger05_journal_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='journal' THEN
  IF TG_OP='DELETE' THEN PERFORM ledger05_assert_journal(OLD."id"); ELSE PERFORM ledger05_assert_journal(NEW."id"); END IF;
 ELSE
  IF TG_OP='DELETE' THEN PERFORM ledger05_assert_journal(OLD."journalId"); ELSE PERFORM ledger05_assert_journal(NEW."journalId"); END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE FUNCTION ledger05_operation_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM ledger05_assert_operation(NEW."id"); RETURN NULL; END; $$;
CREATE CONSTRAINT TRIGGER journal_balanced_at_commit AFTER INSERT OR UPDATE OR DELETE ON "journal" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger05_journal_commit();
CREATE CONSTRAINT TRIGGER posting_balanced_at_commit AFTER INSERT OR UPDATE OR DELETE ON "posting" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger05_journal_commit();
CREATE CONSTRAINT TRIGGER opening_valid_at_commit AFTER INSERT OR UPDATE OR DELETE ON "opening_balance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger05_journal_commit();
CREATE CONSTRAINT TRIGGER operation_valid_at_commit AFTER INSERT ON "ledger_operation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger05_operation_commit();

DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['currency','ledger_account','journal','posting','opening_balance','fx_rate','ledger_operation'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ledger05_no_truncate()',t||'_no_truncate',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=current_schema() AND p.proname LIKE 'ledger05%' LOOP
  EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, %I', f.signature, current_schema());
 END LOOP;
END $$;
UPDATE "app_metadata" SET "value"='4' WHERE "key"='schema_version';

COMMIT;
