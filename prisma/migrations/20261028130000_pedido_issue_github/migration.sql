-- AlterTable
ALTER TABLE "FeatureRequest" ADD COLUMN     "issueErro" TEXT,
ADD COLUMN     "issueNumber" INTEGER,
ADD COLUMN     "issueTentativaEm" TIMESTAMP(3),
ADD COLUMN     "issueUrl" TEXT;

