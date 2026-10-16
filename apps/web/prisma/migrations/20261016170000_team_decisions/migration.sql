-- Preserve accounts, foreign keys and city scopes while renaming the enum value.
ALTER TYPE "Role" RENAME VALUE 'LOCAL_ADMIN' TO 'REGIONAL_ADMIN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "XpReason" ADD VALUE 'WELCOME';
ALTER TYPE "XpReason" ADD VALUE 'RESERVATION_BONUS';
ALTER TYPE "XpReason" ADD VALUE 'EXPIRE';

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "feePaidAt" TIMESTAMP(3),
ADD COLUMN     "feeRecordedById" TEXT,
ADD COLUMN     "replacementFee" INTEGER;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "minimumCharge" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "drawPrize" TEXT,
ADD COLUMN     "drawSlots" INTEGER,
ADD COLUMN     "drawStartedAt" TIMESTAMP(3),
ADD COLUMN     "drawStartedById" TEXT,
ADD COLUMN     "drawWinnerEntryId" TEXT,
ADD COLUMN     "peakEndsAt" TIMESTAMP(3),
ADD COLUMN     "peakStartsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "XpLedger" ADD COLUMN     "awardKey" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Reward" ADD COLUMN     "venueId" TEXT;

-- AlterTable
ALTER TABLE "PromoterReport" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "reservationCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "receiptUrl" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "downPaymentAmount" INTEGER,
ADD COLUMN     "downPaymentAt" TIMESTAMP(3),
ADD COLUMN     "downPaymentById" TEXT,
ADD COLUMN     "minimumCharge" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TrafficRecap" ADD COLUMN     "accountablePerson" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "personInCharge" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "DrawEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "xpSpent" INTEGER NOT NULL,
    "freeCreditId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeDrawCredit" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeDrawCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegionChangeRequest" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "fromCityId" TEXT NOT NULL,
    "toCityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegionChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DrawEntry_freeCreditId_key" ON "DrawEntry"("freeCreditId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawEntry_eventId_memberId_key" ON "DrawEntry"("eventId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawEntry_eventId_position_key" ON "DrawEntry"("eventId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FreeDrawCredit_cityId_periodStart_key" ON "FreeDrawCredit"("cityId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Event_drawWinnerEntryId_key" ON "Event"("drawWinnerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "XpLedger_awardKey_key" ON "XpLedger"("awardKey");

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawEntry" ADD CONSTRAINT "DrawEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawEntry" ADD CONSTRAINT "DrawEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawEntry" ADD CONSTRAINT "DrawEntry_freeCreditId_fkey" FOREIGN KEY ("freeCreditId") REFERENCES "FreeDrawCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeDrawCredit" ADD CONSTRAINT "FreeDrawCredit_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeDrawCredit" ADD CONSTRAINT "FreeDrawCredit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeDrawCredit" ADD CONSTRAINT "FreeDrawCredit_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionChangeRequest" ADD CONSTRAINT "RegionChangeRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionChangeRequest" ADD CONSTRAINT "RegionChangeRequest_fromCityId_fkey" FOREIGN KEY ("fromCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionChangeRequest" ADD CONSTRAINT "RegionChangeRequest_toCityId_fkey" FOREIGN KEY ("toCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One pending home-city request; historical approved/rejected requests are retained.
CREATE UNIQUE INDEX "RegionChangeRequest_one_pending" ON "RegionChangeRequest" ("memberId") WHERE "status" = 'PENDING';
CREATE INDEX "XpLedger_expiry" ON "XpLedger" ("memberId", "expiresAt");
ALTER TABLE "User" ADD CONSTRAINT "regional_admin_has_city" CHECK ("role" <> 'REGIONAL_ADMIN' OR "cityId" IS NOT NULL);
ALTER TABLE "DrawEntry" ADD CONSTRAINT "draw_positive_position" CHECK ("position" > 0 AND "xpSpent" >= 0);
ALTER TABLE "Event" ADD CONSTRAINT "draw_peak_order" CHECK ("peakStartsAt" IS NULL OR "peakEndsAt" > "peakStartsAt");

-- Historical earnings acquire the same calendar-month lifetime as new earnings.
UPDATE "XpLedger" SET "expiresAt" = "createdAt" + interval '18 months' WHERE "delta" > 0;
-- Keep legacy prize/redemption history; retire the weighted catalogue from sale.
UPDATE "Reward" SET "active" = false WHERE "type" = 'SPIN_PRIZE' OR "venueId" IS NULL;
UPDATE "Event" SET "maxSpinsPerMember" = NULL;
-- Replace superseded team defaults and obsolete per-event/per-city overrides.
DELETE FROM "Setting" WHERE "key" IN ('maxSpinsPerEvent', 'leaderboardPeriod', 'promoterBonusKind', 'promoterBonusPerGuestXp', 'promoterCommissionPercent', 'reservationMaxPerEvent', 'reservationApprover', 'hubTimelinePosting');
INSERT INTO "Setting" ("id", "key", "value", "scope", "updatedAt") VALUES
 ('GLOBAL::welcomeBonusXp', 'welcomeBonusXp', '100', 'GLOBAL', now()),
 ('GLOBAL::reservationBonusXp', 'reservationBonusXp', '25', 'GLOBAL', now()),
 ('GLOBAL::xpExpiryMonths', 'xpExpiryMonths', '18', 'GLOBAL', now()),
 ('GLOBAL::drawSlots', 'drawSlots', '5', 'GLOBAL', now()),
 ('GLOBAL::maxSpinsPerEvent', 'maxSpinsPerEvent', '1', 'GLOBAL', now()),
 ('GLOBAL::leaderboardPeriod', 'leaderboardPeriod', '"QUARTERLY"', 'GLOBAL', now()),
 ('GLOBAL::promoterBonusKind', 'promoterBonusKind', '"XP"', 'GLOBAL', now()),
 ('GLOBAL::promoterBonusPerGuestXp', 'promoterBonusPerGuestXp', '5', 'GLOBAL', now()),
 ('GLOBAL::promoterBonusPerReservationXp', 'promoterBonusPerReservationXp', '25', 'GLOBAL', now()),
 ('GLOBAL::freeDrawExpiryMonths', 'freeDrawExpiryMonths', '3', 'GLOBAL', now()),
 ('GLOBAL::regionalAdminLimit', 'regionalAdminLimit', '5', 'GLOBAL', now()),
 ('GLOBAL::cardReplacementFee', 'cardReplacementFee', '100000', 'GLOBAL', now()),
 ('GLOBAL::reservationApprover', 'reservationApprover', '"REGIONAL_ADMIN"', 'GLOBAL', now()),
 ('GLOBAL::hubTimelinePosting', 'hubTimelinePosting', '"HQ"', 'GLOBAL', now())
ON CONFLICT ("id") DO NOTHING;

ALTER TYPE "XpReason" ADD VALUE 'MEMBER_CLAIM';
CREATE TABLE "XpClaim" (
  "id" TEXT PRIMARY KEY, "memberId" TEXT NOT NULL, "eventId" TEXT NOT NULL,
  "formType" TEXT NOT NULL CHECK ("formType" IN ('PR', 'MEMBER')),
  "guestCount" INTEGER NOT NULL DEFAULT 0 CHECK ("guestCount" >= 0),
  "reservationCount" INTEGER NOT NULL CHECK ("reservationCount" >= 0),
  "receiptUrl" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
  "bonusValue" INTEGER, "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3), "rejectReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "XpClaim_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "XpClaim_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "XpClaim_memberId_eventId_formType_key" ON "XpClaim" ("memberId", "eventId", "formType");
CREATE INDEX "XpClaim_status_eventId_idx" ON "XpClaim" ("status", "eventId");

CREATE TABLE "PostReaction" (
 "postId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("postId", "userId"),
 FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "XpLedger" ADD COLUMN "allocations" JSONB;
