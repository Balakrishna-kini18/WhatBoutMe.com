-- AlterEnum
ALTER TYPE "EnrolmentStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_HELD';

-- AlterEnum
ALTER TYPE "EventPaymentStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_HELD';

-- AlterEnum
ALTER TYPE "SeatPoolStatus" ADD VALUE IF NOT EXISTS 'INVOICE_ISSUED';
ALTER TYPE "SeatPoolStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_HELD';

-- AlterTable
ALTER TABLE "Payment"
ADD COLUMN IF NOT EXISTS "expectedAmountMinor" INTEGER,
ADD COLUMN IF NOT EXISTS "expectedCurrency" TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS "chargedCurrency" TEXT,
ADD COLUMN IF NOT EXISTS "chargedAmountMinor" INTEGER,
ADD COLUMN IF NOT EXISTS "fxRate" TEXT,
ADD COLUMN IF NOT EXISTS "priceSnapshot" JSONB,
ADD COLUMN IF NOT EXISTS "checkoutUrl" TEXT,
ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LeadCheckoutLink" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enrolmentId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "batchId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadCheckoutLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LeadCheckoutLink_tokenHash_key" ON "LeadCheckoutLink"("tokenHash");
CREATE INDEX IF NOT EXISTS "LeadCheckoutLink_leadId_idx" ON "LeadCheckoutLink"("leadId");
CREATE INDEX IF NOT EXISTS "LeadCheckoutLink_userId_idx" ON "LeadCheckoutLink"("userId");
CREATE INDEX IF NOT EXISTS "LeadCheckoutLink_enrolmentId_idx" ON "LeadCheckoutLink"("enrolmentId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "InvoiceCounter" (
  "year" INTEGER NOT NULL,
  "lastSeq" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);
