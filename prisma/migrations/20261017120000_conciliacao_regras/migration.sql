-- AlterTable
ALTER TABLE "Reconciliation" ADD COLUMN     "options" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "totalExcess" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ReconciliationItem" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "excess" DECIMAL(14,2),
ADD COLUMN     "rule" TEXT;
