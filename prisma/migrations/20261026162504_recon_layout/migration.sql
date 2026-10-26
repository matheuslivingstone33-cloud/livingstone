-- CreateTable
CREATE TABLE "ReconLayout" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "assinatura" TEXT NOT NULL,
    "cabecalho" JSONB NOT NULL,
    "layout" JSONB NOT NULL,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReconLayout_orgId_assinatura_key" ON "ReconLayout"("orgId", "assinatura");

-- AddForeignKey
ALTER TABLE "ReconLayout" ADD CONSTRAINT "ReconLayout_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
