-- CreateTable
CREATE TABLE "FeatureRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EM_CONVERSA',
    "versoes" JSONB NOT NULL DEFAULT '[]',
    "transcricao" JSONB NOT NULL DEFAULT '[]',
    "prompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureRequest_orgId_status_updatedAt_idx" ON "FeatureRequest"("orgId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "FeatureRequest_orgId_userId_status_idx" ON "FeatureRequest"("orgId", "userId", "status");

-- AddForeignKey
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
