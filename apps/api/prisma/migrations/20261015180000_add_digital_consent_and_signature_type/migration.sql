-- Migration: 20261015180000_add_digital_consent_and_signature_type
-- Task: Requirement 2: Digital Consent, Signature Image Upload & Audit Versioning

ALTER TABLE "SignedAgreement" ADD COLUMN IF NOT EXISTS "consentVersion" TEXT;
ALTER TABLE "SignedAgreement" ADD COLUMN IF NOT EXISTS "consentTimestamp" TIMESTAMP(3);
ALTER TABLE "SignedAgreement" ADD COLUMN IF NOT EXISTS "signatureType" TEXT DEFAULT 'DRAWN';
