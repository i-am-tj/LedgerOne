-- Wealth holding profiles: descriptive, editable metadata for asset/liability
-- ledger accounts (institution, platform, funding account, typed terms and an
-- encrypted identifier vault). Balances remain derived only from postings.
-- Additive; 001–013 unchanged. No production DML grant is added here.
BEGIN;
CREATE TABLE holding_profile (
 "accountId" UUID PRIMARY KEY,
 "workspaceId" UUID NOT NULL,
 "ownerId" TEXT NOT NULL,
 category VARCHAR(32) NOT NULL,
 institution VARCHAR(120),
 "institutionKey" VARCHAR(40),
 platform VARCHAR(120),
 "platformKey" VARCHAR(40),
 "fundingAccountId" UUID,
 details JSONB NOT NULL DEFAULT '{}'::jsonb,
 "secretCipher" TEXT,
 notes VARCHAR(2000),
 revision INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT holding_profile_category CHECK (category IN ('savings','current','fixed-deposits','recurring-deposits','cash','mutual-funds','stocks','bonds','nsc','ppf','nps','gold','other-investments','property','vehicles','receivables','other-assets','credit-cards','loans','other-liabilities')),
 CONSTRAINT holding_profile_details_shape CHECK (jsonb_typeof(details)='object' AND pg_column_size(details)<=16384),
 CONSTRAINT holding_profile_secret_shape CHECK ("secretCipher" IS NULL OR ("secretCipher" LIKE 'v1.%' AND length("secretCipher")<=8192)),
 CONSTRAINT holding_profile_revision_positive CHECK (revision>=1),
 CONSTRAINT holding_profile_funding_distinct CHECK ("fundingAccountId" IS DISTINCT FROM "accountId"),
 CONSTRAINT "holding_profile_accountId_workspaceId_ownerId_fkey" FOREIGN KEY ("accountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "holding_profile_funding_scope_fkey" FOREIGN KEY ("fundingAccountId","workspaceId","ownerId") REFERENCES ledger_account(id,"workspaceId","ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "holding_profile_accountId_workspaceId_ownerId_key" ON holding_profile("accountId","workspaceId","ownerId");
CREATE INDEX "holding_profile_ownerId_workspaceId_category_idx" ON holding_profile("ownerId","workspaceId",category);
CREATE INDEX "holding_profile_fundingAccountId_idx" ON holding_profile("fundingAccountId");

-- The profile category must describe the ledger account kind it decorates,
-- and a funding source must be an owned cash or bank asset.
CREATE FUNCTION wealth14_profile_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k "AccountKind"; fk "AccountKind"; ft "AccountClass"; expected text;
BEGIN
 SELECT kind INTO k FROM ledger_account WHERE id=NEW."accountId" AND "workspaceId"=NEW."workspaceId" AND "ownerId"=NEW."ownerId";
 IF NOT FOUND THEN RAISE EXCEPTION 'Holding account is not owned' USING ERRCODE='23514'; END IF;
 expected := CASE NEW.category
   WHEN 'savings' THEN 'BANK' WHEN 'current' THEN 'BANK'
   WHEN 'fixed-deposits' THEN 'FIXED_DEPOSIT' WHEN 'recurring-deposits' THEN 'FIXED_DEPOSIT'
   WHEN 'cash' THEN 'CASH'
   WHEN 'property' THEN 'OTHER_ASSET' WHEN 'vehicles' THEN 'OTHER_ASSET' WHEN 'other-assets' THEN 'OTHER_ASSET'
   WHEN 'receivables' THEN 'RECEIVABLE'
   WHEN 'credit-cards' THEN 'CREDIT_CARD' WHEN 'loans' THEN 'LOAN' WHEN 'other-liabilities' THEN 'OTHER_LIABILITY'
   ELSE 'INVESTMENT' END;
 IF k::text <> expected THEN RAISE EXCEPTION 'Holding category does not match account kind' USING ERRCODE='23514'; END IF;
 IF NEW."fundingAccountId" IS NOT NULL THEN
  SELECT kind,type INTO fk,ft FROM ledger_account WHERE id=NEW."fundingAccountId" AND "workspaceId"=NEW."workspaceId" AND "ownerId"=NEW."ownerId";
  IF NOT FOUND OR ft<>'ASSET' OR fk NOT IN ('BANK','CASH') THEN
   RAISE EXCEPTION 'Funding account must be an owned bank or cash account' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW."accountId"<>OLD."accountId" OR NEW."ownerId"<>OLD."ownerId" OR NEW."workspaceId"<>OLD."workspaceId") THEN
  RAISE EXCEPTION 'Holding profile scope is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER holding_profile_valid BEFORE INSERT OR UPDATE ON holding_profile FOR EACH ROW EXECUTE FUNCTION wealth14_profile_valid();
DO $$ BEGIN EXECUTE format('ALTER FUNCTION wealth14_profile_valid() SET search_path=pg_catalog,%I,pg_temp',current_schema()); END $$;
-- Profile saves and identifier reveals are audited without ledger linkage.
ALTER TABLE audit_event DROP CONSTRAINT audit_event_action;
ALTER TABLE audit_event ADD CONSTRAINT audit_event_action CHECK (
 (action IN ('workspace.created','workspace.renamed','wealth.profile.created','wealth.profile.updated','wealth.secrets.revealed') AND "operationId" IS NULL AND "targetJournalId" IS NULL AND reason IS NULL) OR
 (action IN ('ledger.posted','ledger.reversed','ledger.corrected','ledger.opened') AND "operationId" IS NOT NULL AND "targetJournalId" IS NOT NULL AND reason IS NOT NULL AND char_length(btrim(reason)) BETWEEN 1 AND 500));
UPDATE app_metadata SET value='14' WHERE key='schema_version';
COMMIT;
