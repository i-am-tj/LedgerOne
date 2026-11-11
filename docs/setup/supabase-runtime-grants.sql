-- Run as migration owner/admin AFTER the existing three Prisma migrations.
-- Review and extend explicit grants when a later story adds a runtime table.
BEGIN;
GRANT SELECT ON ledgerone.app_metadata TO ledgerone_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  ledgerone.auth_user, ledgerone.auth_session, ledgerone.auth_account,
  ledgerone.auth_verification, ledgerone.auth_rate_limit TO ledgerone_app;
GRANT SELECT, INSERT, UPDATE ON ledgerone.workspace TO ledgerone_app;
GRANT SELECT, INSERT ON ledgerone.audit_event TO ledgerone_app;
REVOKE ALL ON ledgerone._prisma_migrations FROM ledgerone_app;
-- No schema CREATE, TRUNCATE, ALTER, ownership or role-membership grant.
COMMIT;
