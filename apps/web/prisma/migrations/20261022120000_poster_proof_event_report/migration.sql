-- 22 Oct 2026: "blast poster" proof with +XP after review, and the admin event report.
-- Additive: one enum value, two new tables.

-- AlterEnum
ALTER TYPE "XpReason" ADD VALUE 'POSTER_SHARE';

-- CreateTable
CREATE TABLE "PosterProof" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "xpAwarded" INTEGER,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosterProof_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "poster_proof_status" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);

-- CreateTable
CREATE TABLE "EventReport" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "tablesSold" INTEGER NOT NULL,
    "sofasSold" INTEGER NOT NULL,
    "fdcSold" INTEGER NOT NULL,
    "paxTotal" INTEGER NOT NULL,
    "membersAttended" INTEGER NOT NULL,
    "nonMembersAttended" INTEGER NOT NULL,
    "newMembers" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_report_non_negative" CHECK ("tablesSold" >= 0 AND "sofasSold" >= 0 AND "fdcSold" >= 0 AND "paxTotal" >= 0 AND "membersAttended" >= 0 AND "nonMembersAttended" >= 0 AND "newMembers" >= 0)
);

-- CreateIndex
CREATE INDEX "PosterProof_status_eventId_idx" ON "PosterProof"("status", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PosterProof_memberId_eventId_key" ON "PosterProof"("memberId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventReport_eventId_key" ON "EventReport"("eventId");

-- CreateIndex
CREATE INDEX "EventReport_cityId_createdAt_idx" ON "EventReport"("cityId", "createdAt");

-- AddForeignKey
ALTER TABLE "PosterProof" ADD CONSTRAINT "PosterProof_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosterProof" ADD CONSTRAINT "PosterProof_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosterProof" ADD CONSTRAINT "PosterProof_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
