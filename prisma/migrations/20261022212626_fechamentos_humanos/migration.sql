-- AlterTable
ALTER TABLE "CreditAnalysis" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "decidedByName" TEXT,
ADD COLUMN     "finalDecision" TEXT,
ADD COLUMN     "justification" TEXT;

-- AlterTable
ALTER TABLE "Reconciliation" ADD COLUMN     "manualCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ReconciliationItem" ADD COLUMN     "linkedItemId" TEXT,
ADD COLUMN     "originalStatus" TEXT,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT,
ADD COLUMN     "resolvedByName" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ReconciliationItemEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationItemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditDecisionEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "fromDecision" TEXT,
    "toDecision" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditDecisionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationItemEvent_itemId_idx" ON "ReconciliationItemEvent"("itemId");

-- CreateIndex
CREATE INDEX "CreditDecisionEvent_analysisId_idx" ON "CreditDecisionEvent"("analysisId");
