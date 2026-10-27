-- AlterTable
ALTER TABLE "Reconciliation" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'BRL';

-- AlterTable
ALTER TABLE "ReconciliationItem" ADD COLUMN     "amountOriginal" DECIMAL(14,2),
ADD COLUMN     "explicadoCambio" BOOLEAN NOT NULL DEFAULT false;

