// Fechamentos humanos da conciliação: carrega, aplica a regra pura e grava com controle de versão.
import type { Prisma, ReconciliationItem } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ConciliacaoManualError,

  planejarAceite,
  planejarBaixa,
  planejarReabertura,
  planejarVinculo,
  resumir,
  type Alteracao,
  type ItemManual,
} from "@/lib/conciliacao-manual";

export type Autor = { orgId: string; userId: string; name: string };
export type Operacao =
  | { tipo: "VINCULAR"; itemId: string; outroId: string; nota: string }
  | { tipo: "ACEITAR_DIVERGENCIA"; itemId: string; nota: string }
  | { tipo: "BAIXAR"; itemId: string; nota: string }
  | { tipo: "REABRIR"; itemId: string; nota: string };

const n = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));
const paraLib = (i: ReconciliationItem): ItemManual => ({ ...i, expectedAmount: n(i.expectedAmount), receivedAmount: n(i.receivedAmount), excess: n(i.excess) });

async function carregar(tx: Prisma.TransactionClient, orgId: string, id: string) {
  // ReconciliationItem não tem orgId: o filtro passa sempre pela conciliação
  const i = await tx.reconciliationItem.findFirst({ where: { id, reconciliation: { orgId } } });
  if (!i) throw new ConciliacaoManualError("Item não encontrado.");
  return i;
}

export async function resolverItem(autor: Autor, op: Operacao, agora: Date) {
  return db.$transaction(async (tx) => {
    const item = await carregar(tx, autor.orgId, op.itemId);
    const lidos = [item];
    let alts: Alteracao[];
    if (op.tipo === "VINCULAR") {
      const outro = await carregar(tx, autor.orgId, op.outroId);
      if (outro.reconciliationId !== item.reconciliationId) throw new ConciliacaoManualError("Os itens precisam ser da mesma conciliação.");
      lidos.push(outro);
      // Aceita a escolha em qualquer ordem: o PENDENTE é sempre o primeiro
      const [p, u] = item.status === "NAO_ESPERADO" ? [outro, item] : [item, outro];
      alts = planejarVinculo(paraLib(p), paraLib(u));
    } else if (op.tipo === "ACEITAR_DIVERGENCIA") alts = [planejarAceite(paraLib(item))];
    else if (op.tipo === "BAIXAR") alts = [planejarBaixa(paraLib(item))];
    else {
      const outro = item.resolution === "MANUAL_VINCULO" && item.linkedItemId ? await carregar(tx, autor.orgId, item.linkedItemId) : null;
      if (outro) lidos.push(outro);
      alts = planejarReabertura(paraLib(item), outro && paraLib(outro));
    }

    const reabrir = op.tipo === "REABRIR";
    for (const a of alts) {
      const lido = lidos.find((l) => l.id === a.id)!;
      const { count } = await tx.reconciliationItem.updateMany({
        where: { id: a.id, version: lido.version, status: lido.status },
        data: {
          ...a.data,
          resolutionNote: reabrir ? null : op.nota,
          resolvedById: reabrir ? null : autor.userId,
          resolvedByName: reabrir ? null : autor.name,
          resolvedAt: reabrir ? null : agora,
          version: { increment: 1 },
        },
      });
      if (count === 0) throw new ConciliacaoManualError("Este item foi alterado por outra pessoa. Recarregue a página e tente de novo.");
      await tx.reconciliationItemEvent.create({
        data: {
          orgId: autor.orgId, itemId: a.id, reconciliationId: item.reconciliationId, action: op.tipo,
          fromStatus: a.fromStatus, toStatus: a.data.status, note: op.nota, userId: autor.userId, userName: autor.name, createdAt: agora,
        },
      });
    }

    const todos = await tx.reconciliationItem.findMany({ where: { reconciliationId: item.reconciliationId } });

    const { excess, ...counts } = resumir(todos.map(paraLib));
    const manualCount = todos.filter((t) => t.resolution).length;
    const { count } = await tx.reconciliation.updateMany({
      where: { id: item.reconciliationId, orgId: autor.orgId },
      data: { ...counts, totalExcess: excess, manualCount, updatedAt: agora },
    });
    if (count === 0) throw new ConciliacaoManualError("Conciliação não encontrada.");
    const outro = lidos.find((l) => l.id !== item.id);
    return { reconciliationId: item.reconciliationId, reference: item.reference, outraReferencia: outro?.reference, para: alts[0].data.status };
  });
}
