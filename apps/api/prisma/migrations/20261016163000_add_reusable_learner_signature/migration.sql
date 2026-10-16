-- Migration: 20261016163000_add_reusable_learner_signature
-- Task: Reusable Digital Signature in Learner Profile

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "savedSignature" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "savedSignatureType" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "savedSignatureUpdatedAt" TIMESTAMP(3);
