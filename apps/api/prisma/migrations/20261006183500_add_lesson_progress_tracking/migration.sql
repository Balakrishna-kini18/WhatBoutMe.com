-- AlterTable
ALTER TABLE "UserLessonProgress" ADD COLUMN     "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "lastPositionSec" DOUBLE PRECISION,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "UserLessonProgress_enrolmentId_viewed_idx" ON "UserLessonProgress"("enrolmentId", "viewed");

-- CreateIndex
CREATE INDEX "UserLessonProgress_lessonId_idx" ON "UserLessonProgress"("lessonId");
