-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "debtor" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "product" TEXT,
    "principal" DECIMAL(14,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EM_ABERTO',
    "importedFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "daysLate" INTEGER NOT NULL,
    "updatedDebt" DECIMAL(14,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "installments" INTEGER NOT NULL,
    "installment" DECIMAL(14,2) NOT NULL,
    "options" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "aiProvider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSTO',
    "acceptedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(14,2),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Debt_orgId_contract_key" ON "Debt"("orgId", "contract");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_token_key" ON "Agreement"("token");

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
