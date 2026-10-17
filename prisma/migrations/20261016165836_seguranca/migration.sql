-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "prevHash" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RestrictedEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "document" TEXT,
    "reason" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestrictedEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestrictedEntry_orgId_document_idx" ON "RestrictedEntry"("orgId", "document");

-- CreateIndex
CREATE INDEX "RestrictedEntry_orgId_nameKey_idx" ON "RestrictedEntry"("orgId", "nameKey");

-- AddForeignKey
ALTER TABLE "RestrictedEntry" ADD CONSTRAINT "RestrictedEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
