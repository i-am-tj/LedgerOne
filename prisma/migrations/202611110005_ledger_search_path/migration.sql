-- P1-S05: forward hardening after initial local test application.
-- Explicit pg_temp last prevents PostgreSQL's implicit temp-schema precedence.
BEGIN;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname=current_schema() AND p.proname LIKE 'ledger05%' LOOP
  EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, %I, pg_temp', f.signature, current_schema());
 END LOOP;
END $$;
UPDATE "app_metadata" SET "value"='5' WHERE "key"='schema_version';
COMMIT;
