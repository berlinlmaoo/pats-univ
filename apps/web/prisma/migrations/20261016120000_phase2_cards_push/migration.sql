-- CreateEnum
CREATE TYPE "ReencodeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'USED', 'EXPIRED');

-- DropIndex
DROP INDEX "Card_batchId_idx";

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "chipType" TEXT,
ADD COLUMN     "encodedStation" TEXT,
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "leaseGrantId" TEXT,
ADD COLUMN     "leaseId" TEXT,
ADD COLUMN     "leaseMode" TEXT,
ADD COLUMN     "leaseStation" TEXT,
ADD COLUMN     "leaseUserId" TEXT,
ADD COLUMN     "replacesCardId" TEXT;

-- AlterTable
ALTER TABLE "CardBatch" ADD COLUMN     "filesError" TEXT,
ADD COLUMN     "filesGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "number" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationPrefs" JSONB;

-- CreateTable
CREATE TABLE "ReencodeRequest" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReencodeStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "grantExpiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReencodeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDispatch" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReencodeRequest_status_createdAt_idx" ON "ReencodeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReencodeRequest_cardId_idx" ON "ReencodeRequest"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "PushDispatch_key_key" ON "PushDispatch"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Card_replacesCardId_key" ON "Card"("replacesCardId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_leaseId_key" ON "Card"("leaseId");

-- CreateIndex
CREATE INDEX "Card_batchId_status_idx" ON "Card"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CardBatch_cityId_number_key" ON "CardBatch"("cityId", "number");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_replacesCardId_fkey" FOREIGN KEY ("replacesCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReencodeRequest" ADD CONSTRAINT "ReencodeRequest_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReencodeRequest" ADD CONSTRAINT "ReencodeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReencodeRequest" ADD CONSTRAINT "ReencodeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Partial unique indexes (not expressible in schema.prisma) ───────────────

-- One live (not REVOKED) card per member: a member can't be queued, batched or encoded twice.
CREATE UNIQUE INDEX "Card_one_live_per_member" ON "Card" ("memberId") WHERE "status" <> 'REVOKED';

-- One open re-encode request (waiting or approved) per card.
CREATE UNIQUE INDEX "ReencodeRequest_one_open_per_card" ON "ReencodeRequest" ("cardId") WHERE "status" IN ('PENDING', 'APPROVED');
