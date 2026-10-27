-- CreateEnum
CREATE TYPE "LearnerStage" AS ENUM ('STAGE_1_CURRICULUM', 'STAGE_2_EXAM', 'STAGE_3_ATTENDANCE', 'STAGE_4_ONE_ON_ONE', 'STAGE_5_MISSION_STATEMENT');

-- CreateEnum
CREATE TYPE "OneOnOneRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MissionStatementStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "AttendanceStatus" ADD VALUE 'PRESENT_LIVE';
ALTER TYPE "AttendanceStatus" ADD VALUE 'PRESENT_RECORDED';

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "liveMinutes" DOUBLE PRECISION,
ADD COLUMN     "recordedMinutes" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Enrolment" ADD COLUMN     "currentStage" "LearnerStage" DEFAULT 'STAGE_1_CURRICULUM',
ADD COLUMN     "attendanceSatisfiedAt" TIMESTAMP(3),
ADD COLUMN     "curriculumCompletedAt" TIMESTAMP(3),
ADD COLUMN     "examPassedAt" TIMESTAMP(3),
ADD COLUMN     "missionStatementApprovedAt" TIMESTAMP(3),
ADD COLUMN     "oneOnOneCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- Partial unique index on ExamAttempt for active IN_PROGRESS attempts (prevents race condition)
CREATE UNIQUE INDEX IF NOT EXISTS "ExamAttempt_enrolmentId_examId_in_progress_key" ON "ExamAttempt"("enrolmentId", "examId") WHERE "status" = 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "minWatchPercent" INTEGER;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "QuestionBank" ADD COLUMN     "examId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "minAttendanceMinutes" INTEGER;

-- AlterTable
ALTER TABLE "UserLessonProgress" ADD COLUMN     "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "watchedRanges" JSONB;

-- CreateTable
CREATE TABLE "SessionRecordingProgress" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enrolmentId" TEXT,
    "watchedRanges" JSONB,
    "coveredSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionRecordingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneOnOneRequest" (
    "id" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedStart" TIMESTAMP(3) NOT NULL,
    "requestedEnd" TIMESTAMP(3) NOT NULL,
    "learnerTimezone" TEXT,
    "notes" TEXT,
    "status" "OneOnOneRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "sessionId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneOnOneRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionStatementSubmission" (
    "id" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "storageKey" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "status" "MissionStatementStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionStatementSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionRecordingProgress_sessionId_idx" ON "SessionRecordingProgress"("sessionId");

-- CreateIndex
CREATE INDEX "SessionRecordingProgress_userId_idx" ON "SessionRecordingProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRecordingProgress_sessionId_userId_key" ON "SessionRecordingProgress"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventKey_key" ON "WebhookEvent"("eventKey");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_createdAt_idx" ON "WebhookEvent"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "OneOnOneRequest_enrolmentId_status_idx" ON "OneOnOneRequest"("enrolmentId", "status");

-- CreateIndex
CREATE INDEX "OneOnOneRequest_userId_status_idx" ON "OneOnOneRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "OneOnOneRequest_status_requestedStart_idx" ON "OneOnOneRequest"("status", "requestedStart");

-- CreateIndex
CREATE INDEX "MissionStatementSubmission_enrolmentId_status_idx" ON "MissionStatementSubmission"("enrolmentId", "status");

-- CreateIndex
CREATE INDEX "MissionStatementSubmission_userId_status_idx" ON "MissionStatementSubmission"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "QuestionBank_examId_idx" ON "QuestionBank"("examId");

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecordingProgress" ADD CONSTRAINT "SessionRecordingProgress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecordingProgress" ADD CONSTRAINT "SessionRecordingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOnOneRequest" ADD CONSTRAINT "OneOnOneRequest_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOnOneRequest" ADD CONSTRAINT "OneOnOneRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOnOneRequest" ADD CONSTRAINT "OneOnOneRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOnOneRequest" ADD CONSTRAINT "OneOnOneRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionStatementSubmission" ADD CONSTRAINT "MissionStatementSubmission_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionStatementSubmission" ADD CONSTRAINT "MissionStatementSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionStatementSubmission" ADD CONSTRAINT "MissionStatementSubmission_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
