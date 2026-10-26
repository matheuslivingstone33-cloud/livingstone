-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "AssistantPlan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantPlan_orgId_userId_status_idx" ON "AssistantPlan"("orgId", "userId", "status");

-- CreateIndex
CREATE INDEX "AiUsage_orgId_userId_createdAt_idx" ON "AiUsage"("orgId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantPlan" ADD CONSTRAINT "AssistantPlan_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
