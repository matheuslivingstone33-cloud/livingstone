import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dt } from "@/lib/format";
import { fraseItem, lerProva } from "@/lib/prova-conciliacao";
import { ProvaView } from "../../Prova";
import { paraFrase, referenciasPagas } from "../../itens";
import { ImprimirProva } from "./ImprimirProva";

// Versão para imprimir ou salvar em PDF da prova de um item. Qualquer perfil pode ver (é só leitura).
export default async function ProvaImpressao({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const s = await requireSession();
  const { id, itemId } = await params;
  const r = await db.reconciliation.findFirst({ where: { id, orgId: s.orgId } });
  if (!r) notFound();
  const item = await db.reconciliationItem.findFirst({ where: { id: itemId.slice(0, 40), reconciliationId: r.id } });
  if (!item) notFound();
  const pagas = referenciasPagas(await db.reconciliationItem.findMany({ where: { reconciliationId: r.id }, omit: { evidence: true } }));
  return (
    <div className="prova-print grid gap-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link className="link-action" href={`/conciliacao/${r.id}?item=${item.id}#prova`}>Voltar para a conciliação</Link>
        <ImprimirProva recId={r.id} itemId={item.id} />
      </div>
      <div className="grid gap-1">
        <h1 className="font-display text-xl font-semibold text-ink-900">Prova da conciliação</h1>
        <p className="text-sm text-ink-600">
          {r.name} · criada em {dt(r.createdAt)} · emitida em {dt(new Date())} por {s.name}
        </p>
      </div>
      <ProvaView prova={lerProva(item.evidence)} frase={fraseItem(paraFrase(item), { pagas })} />
    </div>
  );
}
