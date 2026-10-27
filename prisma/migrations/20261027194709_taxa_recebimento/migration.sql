-- AlterTable
ALTER TABLE "ReconciliationItem" ADD COLUMN     "explicadoTaxa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "taxaEsperada" DECIMAL(14,2);
