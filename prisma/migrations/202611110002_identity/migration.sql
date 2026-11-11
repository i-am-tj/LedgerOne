-- P1-S03: additive identity tables; no financial data is modified.
CREATE TABLE "auth_user" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false, "image" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "auth_user_email_key" ON "auth_user"("email");
CREATE TABLE "auth_session" (
  "id" TEXT PRIMARY KEY, "expiresAt" TIMESTAMP(3) NOT NULL, "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "ipAddress" TEXT, "userAgent" TEXT, "userId" TEXT NOT NULL,
  CONSTRAINT "auth_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "auth_session_token_key" ON "auth_session"("token");
CREATE INDEX "auth_session_userId_idx" ON "auth_session"("userId");
CREATE INDEX "auth_session_expiresAt_idx" ON "auth_session"("expiresAt");
CREATE TABLE "auth_account" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "providerId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "accessToken" TEXT, "refreshToken" TEXT, "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3), "refreshTokenExpiresAt" TIMESTAMP(3), "scope" TEXT, "password" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "auth_account_providerId_accountId_key" ON "auth_account"("providerId", "accountId");
CREATE INDEX "auth_account_userId_idx" ON "auth_account"("userId");
CREATE TABLE "auth_verification" (
  "id" TEXT PRIMARY KEY, "identifier" TEXT NOT NULL, "value" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification"("identifier");
CREATE INDEX "auth_verification_expiresAt_idx" ON "auth_verification"("expiresAt");
CREATE TABLE "auth_rate_limit" (
  "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL, "count" INTEGER NOT NULL, "lastRequest" BIGINT NOT NULL
);
CREATE UNIQUE INDEX "auth_rate_limit_key_key" ON "auth_rate_limit"("key");
UPDATE "app_metadata" SET "value" = '2' WHERE "key" = 'schema_version';
