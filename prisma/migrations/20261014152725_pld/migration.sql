-- CreateTable
CREATE TABLE "PldBatch" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "transactions" INTEGER NOT NULL,
    "clients" INTEGER NOT NULL,
    "alerts" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PldBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PldTransaction" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "clientDoc" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "counterparty" TEXT,
    "counterDoc" TEXT,

    CONSTRAINT "PldTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PldCase" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "clientDoc" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "declaredIncome" DECIMAL(14,2),
    "pep" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL,
    "risk" TEXT NOT NULL,
    "alerts" JSONB NOT NULL,
    "totalIn" DECIMAL(14,2) NOT NULL,
    "totalOut" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EM_ANALISE',
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "dossier" TEXT,
    "dossierAi" TEXT,
    "decision" TEXT,
    "protocol" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PldCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PldTransaction_batchId_clientDoc_idx" ON "PldTransaction"("batchId", "clientDoc");

-- CreateIndex
CREATE INDEX "PldCase_orgId_status_idx" ON "PldCase"("orgId", "status");

-- AddForeignKey
ALTER TABLE "PldBatch" ADD CONSTRAINT "PldBatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PldTransaction" ADD CONSTRAINT "PldTransaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PldBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PldCase" ADD CONSTRAINT "PldCase_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PldCase" ADD CONSTRAINT "PldCase_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PldBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
