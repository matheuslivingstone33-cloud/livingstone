-- AlterTable
ALTER TABLE "PldBatch" ADD COLUMN     "error" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'CONCLUIDO';

-- CreateIndex
CREATE INDEX "PldBatch_orgId_status_idx" ON "PldBatch"("orgId", "status");
