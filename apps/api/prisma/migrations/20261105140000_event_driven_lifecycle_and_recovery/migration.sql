-- AlterTable
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "scheduleVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "OutboxEvent" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "leasedUntil" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "enqueuedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastError" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExamAttempt_status_expiresAt_idx" ON "ExamAttempt"("status", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Session_status_startTime_idx" ON "Session"("status", "startTime");
CREATE INDEX IF NOT EXISTS "Session_status_endTime_idx" ON "Session"("status", "endTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OutboxEvent_status_nextAttemptAt_idx" ON "OutboxEvent"("status", "nextAttemptAt");

