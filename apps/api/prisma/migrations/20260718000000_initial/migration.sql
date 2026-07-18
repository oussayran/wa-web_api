CREATE TYPE "AdminRole" AS ENUM ('ADMIN');
CREATE TYPE "ConnectionStatus" AS ENUM ('DISCONNECTED', 'INITIALIZING', 'WAITING_FOR_QR', 'CONNECTING', 'CONNECTED', 'RECONNECTING', 'LOGGED_OUT', 'ERROR');
CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND');
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

CREATE TABLE "AdminUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "csrfHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppInstance" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "connectedPhone" TEXT,
  "connectedJid" TEXT,
  "lastConnectedAt" TIMESTAMP(3),
  "lastDisconnectedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "reconnectAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppAuthState" (
  "id" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "authKey" TEXT NOT NULL,
  "encryptedPayload" BYTEA NOT NULL,
  "iv" BYTEA NOT NULL,
  "authTag" BYTEA NOT NULL,
  "encryptionVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppAuthState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "direction" "MessageDirection" NOT NULL DEFAULT 'OUTBOUND',
  "recipientNumber" TEXT NOT NULL,
  "recipientJid" TEXT NOT NULL,
  "textPreview" TEXT,
  "encryptedText" BYTEA,
  "externalMessageId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "consentConfirmed" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "safeMetadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
CREATE UNIQUE INDEX "WhatsAppAuthState_instanceId_authKey_key" ON "WhatsAppAuthState"("instanceId", "authKey");
CREATE INDEX "WhatsAppAuthState_instanceId_idx" ON "WhatsAppAuthState"("instanceId");
CREATE UNIQUE INDEX "Message_adminUserId_instanceId_idempotencyKey_key" ON "Message"("adminUserId", "instanceId", "idempotencyKey");
CREATE INDEX "Message_instanceId_createdAt_idx" ON "Message"("instanceId", "createdAt");
CREATE INDEX "Message_externalMessageId_idx" ON "Message"("externalMessageId");
CREATE INDEX "Message_status_idx" ON "Message"("status");
CREATE INDEX "AuditLog_adminUserId_createdAt_idx" ON "AuditLog"("adminUserId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAuthState" ADD CONSTRAINT "WhatsAppAuthState_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
