-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "reguaPauseReason" TEXT,
ADD COLUMN     "reguaPausedAt" TIMESTAMP(3),
ADD COLUMN     "reguaPausedBy" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "collectionRunLockUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CollectionMessage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "motivo" TEXT,
    "providerId" TEXT,
    "debtorKey" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionMessage_orgId_createdAt_idx" ON "CollectionMessage"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "CollectionMessage_orgId_debtorKey_sentAt_idx" ON "CollectionMessage"("orgId", "debtorKey", "sentAt");

-- CreateIndex
CREATE INDEX "CollectionMessage_orgId_status_idx" ON "CollectionMessage"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionMessage_agreementId_etapa_key" ON "CollectionMessage"("agreementId", "etapa");

-- AddForeignKey
ALTER TABLE "CollectionMessage" ADD CONSTRAINT "CollectionMessage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionMessage" ADD CONSTRAINT "CollectionMessage_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionMessage" ADD CONSTRAINT "CollectionMessage_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
