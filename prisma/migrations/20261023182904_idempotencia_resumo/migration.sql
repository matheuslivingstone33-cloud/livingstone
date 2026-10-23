-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "proposalLockUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DailySummary" (
    "orgId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "factsHash" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "lockUntil" TIMESTAMP(3),

    CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("orgId")
);

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
