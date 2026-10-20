// Persistência de um lote de PLD: tudo ou nada, em blocos que cabem no limite de parâmetros do Postgres.
import { db } from "@/lib/db";
import type { ListIndex } from "@/lib/lists";
import type { PldCfg, Tx } from "@/lib/pld";
import { chunk, prepararLote, tamanhoChunk } from "@/lib/pld-lote";

export type LotePldInput = { fileName: string; txs: Tx[]; cfg: PldCfg; listas: ListIndex; agora: Date };
/** aposChunk: só para teste manual de falha no meio da gravação. */
export type LotePldOpts = { aposChunk?: (i: number) => void };

const COLUNAS_TX = 10; // id, batchId, date, clientDoc, clientName, type, direction, amount, counterparty, counterDoc
const CHUNK_CASOS = 500;

export async function persistirLotePld(orgId: string, input: LotePldInput, opts: LotePldOpts = {}) {
  // Falha aqui: nada é gravado
  const lote = prepararLote(input.txs, input.cfg, input.listas, input.agora);
  const batch = await db.pldBatch.create({
    data: {
      orgId,
      fileName: input.fileName,
      transactions: lote.transacoes,
      clients: lote.clientes,
      alerts: lote.alertas,
      periodStart: lote.periodStart,
      periodEnd: lote.periodEnd,
      status: "PROCESSANDO",
    },
  });
  try {
    await db.$transaction(
      async (tx) => {
        let i = 0;
        for (const bloco of chunk(input.txs, tamanhoChunk(COLUNAS_TX))) {
          await tx.pldTransaction.createMany({
            data: bloco.map((t) => ({
              batchId: batch.id,
              date: t.date,
              clientDoc: t.clientDoc,
              clientName: t.clientName,
              type: t.type,
              direction: t.direction,
              amount: t.amount,
              counterparty: t.counterparty,
              counterDoc: t.counterDoc,
            })),
          });
          opts.aposChunk?.(i++);
        }
        for (const bloco of chunk(lote.casos, CHUNK_CASOS)) {
          await tx.pldCase.createMany({ data: bloco.map((c) => ({ ...c, orgId, batchId: batch.id, alerts: c.alerts })) });
        }
        await tx.pldBatch.update({ where: { id: batch.id }, data: { status: "CONCLUIDO" } });
      },
      { timeout: 55_000, maxWait: 10_000 },
    );
  } catch (e) {
    const motivo = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    // A transação já desfez as linhas; a limpeza abaixo é só defesa
    await db.pldTransaction.deleteMany({ where: { batchId: batch.id } }).catch(() => undefined);
    await db.pldCase.deleteMany({ where: { batchId: batch.id } }).catch(() => undefined);
    await db.pldBatch.update({ where: { id: batch.id }, data: { status: "FALHOU", error: motivo } }).catch(() => undefined);
    throw e;
  }
  return { batchId: batch.id, ...lote, casos: lote.casos.length };
}
