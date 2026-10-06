-- CreateEnum
CREATE TYPE "StepOverrideState" AS ENUM ('AUTOMATIC', 'MANUAL_UNLOCKED', 'MANUAL_LOCKED');

-- AlterTable
ALTER TABLE "StepProgress" ADD COLUMN     "overrideState" "StepOverrideState" NOT NULL DEFAULT 'AUTOMATIC',
ADD COLUMN     "overrideReason" TEXT,
ADD COLUMN     "overriddenById" TEXT,
ADD COLUMN     "overriddenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "StepProgress_enrolmentId_overrideState_idx" ON "StepProgress"("enrolmentId", "overrideState");
