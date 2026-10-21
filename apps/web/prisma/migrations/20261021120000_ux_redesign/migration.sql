-- UX redesign (21 Oct 2026): event poster/description approval and the member Home task flow.
-- Additive only: two new tables, no change to existing rows or columns.

-- CreateTable
CREATE TABLE "EventContentSubmission" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "description" TEXT,
    "posterKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventContentSubmission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_status" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
    CONSTRAINT "content_has_change" CHECK ("description" IS NOT NULL OR "posterKey" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "MemberEventStep" (
    "memberId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberEventStep_pkey" PRIMARY KEY ("memberId","eventId","step"),
    CONSTRAINT "member_step_tappable" CHECK ("step" IN ('event', 'poster', 'reservation'))
);

-- CreateIndex
CREATE INDEX "EventContentSubmission_status_createdAt_idx" ON "EventContentSubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EventContentSubmission_eventId_createdAt_idx" ON "EventContentSubmission"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberEventStep_eventId_idx" ON "MemberEventStep"("eventId");

-- AddForeignKey
ALTER TABLE "EventContentSubmission" ADD CONSTRAINT "EventContentSubmission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventContentSubmission" ADD CONSTRAINT "EventContentSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventContentSubmission" ADD CONSTRAINT "EventContentSubmission_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberEventStep" ADD CONSTRAINT "MemberEventStep_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberEventStep" ADD CONSTRAINT "MemberEventStep_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One waiting submission per event: a newer one withdraws the older in the same transaction.
CREATE UNIQUE INDEX "EventContentSubmission_one_pending" ON "EventContentSubmission" ("eventId") WHERE "status" = 'PENDING';
