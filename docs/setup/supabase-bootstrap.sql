-- P1-S04A reviewed provisioning artifact; NOT a Prisma migration.
-- Run once as the project administrator, before Prisma deploy, on a new DB.
-- Passwords are deliberately absent. Set unique role passwords privately.
BEGIN;
CREATE ROLE ledgerone_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE ledgerone_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT ledgerone_migrator TO postgres;
CREATE SCHEMA ledgerone AUTHORIZATION ledgerone_migrator;
REVOKE ALL ON SCHEMA ledgerone FROM PUBLIC;
-- These roles exist on Supabase; local rehearsal skips absent platform roles.
DO $$ DECLARE platform_role text; BEGIN
  FOREACH platform_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = platform_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA ledgerone FROM %I', platform_role);
    END IF;
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA ledgerone TO ledgerone_app;
-- Explicit table grants are applied AFTER each reviewed migration (next file).
-- No blanket future-table privileges or function execution for PUBLIC.
ALTER DEFAULT PRIVILEGES FOR ROLE ledgerone_migrator IN SCHEMA ledgerone REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
COMMIT;
