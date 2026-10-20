-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "seq" INTEGER;

-- CreateIndex
CREATE INDEX "AuditLog_orgId_action_createdAt_idx" ON "AuditLog"("orgId", "action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_orgId_seq_key" ON "AuditLog"("orgId", "seq");

