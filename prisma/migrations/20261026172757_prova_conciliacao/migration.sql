-- AlterTable
ALTER TABLE "Reconciliation" ADD COLUMN     "bankFileSha256" TEXT,
ADD COLUMN     "expectedFileSha256" TEXT;

-- AlterTable
ALTER TABLE "ReconciliationItem" ADD COLUMN     "evidence" JSONB;
