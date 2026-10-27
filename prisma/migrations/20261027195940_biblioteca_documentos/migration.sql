-- CreateTable
CREATE TABLE "DocumentoBiblioteca" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "titulo" TEXT NOT NULL,
    "explicacao" TEXT NOT NULL,
    "cabecalho" JSONB,
    "colunas" JSONB NOT NULL DEFAULT '[]',
    "frequencia" TEXT,
    "uso" TEXT,
    "criadoPor" TEXT NOT NULL,
    "atualizadoPor" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoBiblioteca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentoBiblioteca_orgId_status_updatedAt_idx" ON "DocumentoBiblioteca"("orgId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoBiblioteca_orgId_chave_key" ON "DocumentoBiblioteca"("orgId", "chave");

-- AddForeignKey
ALTER TABLE "DocumentoBiblioteca" ADD CONSTRAINT "DocumentoBiblioteca_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
