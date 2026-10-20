-- AlterTable
ALTER TABLE "Agreement" ADD COLUMN     "aiStatus" TEXT,
ADD COLUMN     "messageBase" TEXT;

-- AlterTable
ALTER TABLE "CreditAnalysis" ADD COLUMN     "aiStatus" TEXT,
ADD COLUMN     "opinionBase" TEXT;

-- AlterTable
ALTER TABLE "LegacyAnalysis" ADD COLUMN     "aiStatus" TEXT;

-- AlterTable
ALTER TABLE "PldCase" ADD COLUMN     "dossierAiAt" TIMESTAMP(3),
ADD COLUMN     "dossierAiText" TEXT,
ADD COLUMN     "dossierBase" TEXT;
