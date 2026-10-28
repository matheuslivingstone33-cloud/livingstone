-- CreateTable
CREATE TABLE "AssistantMessageLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "fim" TEXT NOT NULL,
    "ferramentas" TEXT[],
    "passos" INTEGER NOT NULL DEFAULT 0,
    "custoUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "anexo" JSONB,
    "pedidoId" TEXT,
    "documentoId" TEXT,
    "planoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantMessageLog_orgId_userId_createdAt_idx" ON "AssistantMessageLog"("orgId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantMessageLog_createdAt_idx" ON "AssistantMessageLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AssistantMessageLog" ADD CONSTRAINT "AssistantMessageLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

