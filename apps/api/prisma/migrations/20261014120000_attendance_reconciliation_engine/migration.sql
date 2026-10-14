-- Migration: 20261014120000_attendance_reconciliation_engine
-- Domain: Attendance Tracking & Reconciliation Engine (Phase 1)

-- 1. Create Enums
CREATE TYPE "AttendanceSource" AS ENUM ('AUTO', 'MANUAL', 'QR_CHECKIN');
CREATE TYPE "DeliveryMode" AS ENUM ('ONLINE', 'IN_PERSON', 'HYBRID');

-- 2. Alter AttendanceStatus Enum
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'PRESENT';
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'EXCUSED';
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'PENDING';

-- 3. Alter MeetingProvider Enum
ALTER TYPE "MeetingProvider" ADD VALUE IF NOT EXISTS 'IN_PERSON';

-- 4. Alter SessionType Enum
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'WELCOME_CALL_11_STEPS';
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'CLOSING_CALL_11_STEPS';
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'ONE_ON_ONE_WITH_RO';
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'VISION_BOARD_WORKSHOP';
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'VISION_BOARD_ONLINE';
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'SPEAKER_DISCOVERY_CALL';
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'BATCH_CLASS';

-- 5. Alter Program Table
ALTER TABLE "Program" 
  ADD COLUMN IF NOT EXISTS "attendanceRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN IF NOT EXISTS "minAttendancePercentage" INTEGER NOT NULL DEFAULT 75;

-- 6. Alter Session Table
ALTER TABLE "Session" 
  ADD COLUMN IF NOT EXISTS "checkinTokenSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "externalMeetingId" TEXT,
  ADD COLUMN IF NOT EXISTS "meetingLink" TEXT,
  ADD COLUMN IF NOT EXISTS "recordingLink" TEXT,
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ALTER COLUMN "batchId" DROP NOT NULL;

-- 7. Alter Attendance Table
-- Drop old indexes before altering
DROP INDEX IF EXISTS "Attendance_sessionId_enrolmentId_key";
DROP INDEX IF EXISTS "Attendance_sessionId_userId_idx";

ALTER TABLE "Attendance" 
  ADD COLUMN IF NOT EXISTS "attendancePercentage" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "minutesPresent" INTEGER,
  ADD COLUMN IF NOT EXISTS "overrideReason" TEXT,
  ADD COLUMN IF NOT EXISTS "source" "AttendanceSource" NOT NULL DEFAULT 'AUTO',
  ALTER COLUMN "enrolmentId" DROP NOT NULL;

-- Ensure userId is not null for all existing records
UPDATE "Attendance" a
SET "userId" = e."userId"
FROM "Enrolment" e
WHERE a."enrolmentId" = e."id" AND a."userId" IS NULL;

ALTER TABLE "Attendance" ALTER COLUMN "userId" SET NOT NULL;

-- 8. Alter UnmatchedAttendance Table
DROP INDEX IF EXISTS "UnmatchedAttendance_sessionId_idx";
DROP INDEX IF EXISTS "UnmatchedAttendance_status_idx";

ALTER TABLE "UnmatchedAttendance" 
  ADD COLUMN IF NOT EXISTS "linkedUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "minutesPresent" INTEGER,
  ADD COLUMN IF NOT EXISTS "rawPayload" JSONB;

-- 9. Create Indexes & Unique Constraints
CREATE INDEX IF NOT EXISTS "Attendance_sessionId_enrolmentId_idx" ON "Attendance"("sessionId", "enrolmentId");
CREATE INDEX IF NOT EXISTS "Attendance_userId_idx" ON "Attendance"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_sessionId_userId_key" ON "Attendance"("sessionId", "userId");

CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "UnmatchedAttendance_sessionId_status_idx" ON "UnmatchedAttendance"("sessionId", "status");

-- 10. Foreign Keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Session_userId_fkey'
  ) THEN
    ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UnmatchedAttendance_linkedUserId_fkey'
  ) THEN
    ALTER TABLE "UnmatchedAttendance" ADD CONSTRAINT "UnmatchedAttendance_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
