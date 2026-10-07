-- Migration: 20261007104000_add_agreement_template_versioning
-- Task: D1-039 Agreement Template Versioning & Historical Immutability

-- 1. Create AgreementTemplateVersion Table
CREATE TABLE "AgreementTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "changelog" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgreementTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- 2. Backfill existing AgreementTemplate data into AgreementTemplateVersion
INSERT INTO "AgreementTemplateVersion" (
    "id",
    "templateId",
    "version",
    "content",
    "changelog",
    "status",
    "publishedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    "id",
    "version",
    "content",
    'Initial baseline version migrated during D1-039 transition',
    CASE WHEN "isActive" THEN 'PUBLISHED'::"ContentStatus" ELSE 'DRAFT'::"ContentStatus" END,
    CASE WHEN "isActive" THEN "createdAt" ELSE NULL END,
    "createdAt",
    "updatedAt"
FROM "AgreementTemplate";

-- 3. Alter AgreementTemplate: add description, drop old indexes & columns
ALTER TABLE "AgreementTemplate" ADD COLUMN "description" TEXT;

DROP INDEX IF EXISTS "AgreementTemplate_programId_version_key";
DROP INDEX IF EXISTS "AgreementTemplate_programId_isActive_idx";

ALTER TABLE "AgreementTemplate" DROP COLUMN IF EXISTS "version";
ALTER TABLE "AgreementTemplate" DROP COLUMN IF EXISTS "content";
ALTER TABLE "AgreementTemplate" DROP COLUMN IF EXISTS "isActive";

-- 4. Alter SignedAgreement: add versionId and backfill from AgreementTemplateVersion
ALTER TABLE "SignedAgreement" ADD COLUMN "versionId" TEXT;

UPDATE "SignedAgreement" sa
SET "versionId" = atv."id"
FROM "AgreementTemplateVersion" atv
WHERE atv."templateId" = sa."templateId" AND atv."version" = sa."templateVersion";

-- Fallback for any orphaned signed agreements: link to any version of that template if version string differed
UPDATE "SignedAgreement" sa
SET "versionId" = (
    SELECT atv."id" 
    FROM "AgreementTemplateVersion" atv 
    WHERE atv."templateId" = sa."templateId" 
    ORDER BY atv."createdAt" ASC 
    LIMIT 1
)
WHERE sa."versionId" IS NULL;

-- Enforce NOT NULL on versionId
ALTER TABLE "SignedAgreement" ALTER COLUMN "versionId" SET NOT NULL;

-- 5. Create Indexes
CREATE UNIQUE INDEX "AgreementTemplateVersion_templateId_version_key" ON "AgreementTemplateVersion"("templateId", "version");
CREATE INDEX "AgreementTemplateVersion_templateId_status_idx" ON "AgreementTemplateVersion"("templateId", "status");
CREATE INDEX "AgreementTemplate_programId_idx" ON "AgreementTemplate"("programId");
CREATE INDEX "SignedAgreement_versionId_idx" ON "SignedAgreement"("versionId");

-- 6. Add Foreign Keys
ALTER TABLE "AgreementTemplateVersion" 
    ADD CONSTRAINT "AgreementTemplateVersion_templateId_fkey" 
    FOREIGN KEY ("templateId") REFERENCES "AgreementTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgreementTemplateVersion" 
    ADD CONSTRAINT "AgreementTemplateVersion_createdById_fkey" 
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RESTRICT deletion of any template version that has signed agreements
ALTER TABLE "SignedAgreement" 
    ADD CONSTRAINT "SignedAgreement_versionId_fkey" 
    FOREIGN KEY ("versionId") REFERENCES "AgreementTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. PostgreSQL Database-Level Immutability Enforcement Triggers
CREATE OR REPLACE FUNCTION check_agreement_template_version_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Published or Archived versions cannot mutate content or version string
    IF (OLD.status = 'PUBLISHED' OR OLD.status = 'ARCHIVED') THEN
        IF (NEW.content <> OLD.content OR NEW.version <> OLD.version) THEN
            RAISE EXCEPTION 'ImmutableAgreementVersionError: Cannot modify content or version tag of a published or archived agreement version';
        END IF;
    END IF;

    -- Versions with existing signed agreements cannot mutate content or version tag under any circumstances
    IF EXISTS (SELECT 1 FROM "SignedAgreement" WHERE "versionId" = OLD.id) THEN
        IF (NEW.content <> OLD.content OR NEW.version <> OLD.version) THEN
            RAISE EXCEPTION 'ImmutableAgreementVersionError: Cannot modify agreement version with historical signed agreements';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agreement_template_version_immutability ON "AgreementTemplateVersion";
CREATE TRIGGER trg_agreement_template_version_immutability
BEFORE UPDATE ON "AgreementTemplateVersion"
FOR EACH ROW
EXECUTE FUNCTION check_agreement_template_version_immutability();

CREATE OR REPLACE FUNCTION check_signed_agreement_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Historical signed agreement version references cannot be tampered with
    IF (NEW."versionId" <> OLD."versionId" OR NEW."templateVersion" <> OLD."templateVersion" OR NEW."templateId" <> OLD."templateId") THEN
        RAISE EXCEPTION 'ImmutableSignedAgreementError: Cannot alter template version references on a signed agreement';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_signed_agreement_immutability ON "SignedAgreement";
CREATE TRIGGER trg_signed_agreement_immutability
BEFORE UPDATE ON "SignedAgreement"
FOR EACH ROW
EXECUTE FUNCTION check_signed_agreement_immutability();
