-- CreateTable
CREATE TABLE "DemonstrativoPeriodo" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "origem" TEXT NOT NULL,
    "empresa" TEXT,
    "linhas" JSONB NOT NULL,
    "contas" JSONB,
    "inferidas" JSONB,
    "alertas" JSONB,
    "arquivoHash" TEXT,
    "criadoPor" TEXT NOT NULL,
    "conferidoPor" TEXT,
    "conferidoEm" TIMESTAMP(3),
    "aceiteAlertas" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemonstrativoPeriodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificacaoConta" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "classe" TEXT NOT NULL DEFAULT 'nao_classificada',
    "atencao" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "ClassificacaoConta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemonstrativoPeriodo_orgId_ano_idx" ON "DemonstrativoPeriodo"("orgId", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "DemonstrativoPeriodo_orgId_ano_mes_key" ON "DemonstrativoPeriodo"("orgId", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "ClassificacaoConta_orgId_conta_key" ON "ClassificacaoConta"("orgId", "conta");

-- AddForeignKey
ALTER TABLE "DemonstrativoPeriodo" ADD CONSTRAINT "DemonstrativoPeriodo_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificacaoConta" ADD CONSTRAINT "ClassificacaoConta_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

