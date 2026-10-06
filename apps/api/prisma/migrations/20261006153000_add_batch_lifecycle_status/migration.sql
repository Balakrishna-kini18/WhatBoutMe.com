-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "status" "BatchStatus" NOT NULL DEFAULT 'UPCOMING';

-- CreateIndex
CREATE INDEX "Batch_programId_status_idx" ON "Batch"("programId", "status");

-- CreateIndex
CREATE INDEX "Batch_managerId_status_idx" ON "Batch"("managerId", "status");
