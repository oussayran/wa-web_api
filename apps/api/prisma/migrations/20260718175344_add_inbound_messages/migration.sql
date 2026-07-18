-- AlterEnum
ALTER TYPE "MessageDirection" ADD VALUE 'INBOUND';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "senderJid" TEXT,
ADD COLUMN     "senderNumber" TEXT,
ALTER COLUMN "adminUserId" DROP NOT NULL,
ALTER COLUMN "idempotencyKey" DROP NOT NULL,
ALTER COLUMN "consentConfirmed" DROP NOT NULL;
