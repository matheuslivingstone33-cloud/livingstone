import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day, dt } from "@/lib/format";
import { Badge, Notice, PageTitle, Stat, StatusBadge, TableCard } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { ReconcileOptions } from "@/lib/reconcile";
import { GRUPOS, ROTULO_GRUPO, fraseItem, grupoDe, lerProva, type Grupo } from "@/lib/prova-conciliacao";
import { ResolverItem } from "./ResolverItem";
import { ProvaView } from "./Prova";
import { filtroTaxaDe, linhasTaxa, paraFrase, referenciasPagas } from "./itens";

const resolucaoLabel: Record<string, string> = { MANUAL_VINCULO: "Vínculo manual", ACEITE_DIVERGENCIA: "Divergência aceita", BAIXA: "Resolvido manualmente" };
const acaoLabel: Record<string, string> = { VINCULAR: "Vinculou", ACEITAR_DIVERGENCIA: "Aceitou divergência", BAIXAR: "Baixou", REABRIR: "Reabriu" };
const TOM: Record<Grupo, string> = { pagos: "green", diferente: "amber", nao_chegou: "red", sem_cobranca: "blue" };


export default async function ConciliacaoDetalhe({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; item?: string; taxa?: string }>;
}) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const tipo = GRUPOS.find((g) => g === sp.tipo);
  const r = await db.reconciliation.findFirst({ where: { id, orgId: s.orgId } });
  if (!r) notFound();
  const todos = await db.reconciliationItem.findMany({ where: { reconciliationId: r.id }, omit: { evidence: true }, orderBy: [{ status: "asc" }, { reference: "asc" }] });
  const pagas = referenciasPagas(todos);
  const contagem = Object.fromEntries(GRUPOS.map((g) => [g, 0])) as Record<Grupo, number>;
  for (const i of todos) contagem[grupoDe(i.status, i.originalStatus)]++;
  const doGrupo = tipo ? todos.filter((i) => grupoDe(i.status, i.originalStatus) === tipo) : todos;
  // Subfiltro de "Valor diferente": a taxa de cartão é só uma pista; o status continua DIVERGENTE
  const comTaxa = tipo === "diferente" && doGrupo.some((i) => i.explicadoTaxa || i.taxaEsperada !== null);
  const taxa = comTaxa ? filtroTaxaDe(sp.taxa) : undefined;
  const explicados = doGrupo.filter((i) => i.explicadoTaxa).length;
  const items = taxa ? doGrupo.filter((i) => (taxa === "explicada") === i.explicadoTaxa) : doGrupo;

  // Prova: só depois de a conciliação ter sido validada pela instituição da sessão
  const itemId = typeof sp.item === "string" ? sp.item.slice(0, 40) : "";
  const aberto = itemId ? await db.reconciliationItem.findFirst({ where: { id: itemId, reconciliationId: r.id } }) : null;

  const podeEditar = s.role !== "AUDITOR";
  const naoEsperados = podeEditar ? todos.filter((u) => u.status === "NAO_ESPERADO" && !u.resolution) : [];
  const opcoes = naoEsperados.map((u) => ({ id: u.id, label: `${u.reference} · ${brl(u.receivedAmount)} · ${day(u.paidAt)}` }));
  const eventos = await db.reconciliationItemEvent.findMany({ where: { reconciliationId: r.id, orgId: s.orgId }, orderBy: { createdAt: "asc" } });
  const refPorId = new Map(todos.map((x) => [x.id, x.reference]));
  const diff = Number(r.totalReceived) - Number(r.totalExpected);
  const opts = (r.options ?? {}) as Partial<ReconcileOptions>;
  const rules = [
    opts.toleranciaCentavos ? `tolerância de ${opts.toleranciaCentavos} centavo(s)` : "",
    opts.casarPorValorData ? `valor e data (±${opts.toleranciaDias ?? 0} dia(s))` : "",
  ].filter(Boolean).join(", ");
  const link = (q: { tipo?: string; item?: string; taxa?: string }) => {
    const p = new URLSearchParams();
    if (q.tipo) p.set("tipo", q.tipo);
    if (q.tipo && q.taxa) p.set("taxa", q.taxa);
    if (q.item) p.set("item", q.item);
    const t = p.toString();
    return t ? `?${t}` : "?";
  };

  return (
    <>
      <PageTitle
        back={{ href: "/conciliacao", label: "Conciliações" }}
        title={r.name}
        subtitle={`${r.bankFileName} (${r.bankFormat}) × ${r.expectedFileName} · ${dt(r.createdAt)}`}
        action={<a className="btn-ghost" href={`/api/conciliacao/${r.id}/csv`}><Icon name="download" size={16} />Exportar CSV</a>}
      />
      <nav aria-label="Filtrar itens por resultado" className="mb-4 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {GRUPOS.map((g) => (
          <Stat
            key={g}
            label={ROTULO_GRUPO[g]}
            value={contagem[g]}
            tone={TOM[g]}
            href={tipo === g ? link({}) : link({ tipo: g })}
            hint={tipo === g ? "Filtro ativo: clique para ver todos" : undefined}
          />
        ))}
      </nav>
      <p className="mb-6 text-sm text-ink-600">
        Esperado <b>{brl(r.totalExpected)}</b> · recebido <b>{brl(r.totalReceived)}</b> · diferença <b>{brl(diff)}</b>
        {Number(r.totalExcess) > 0 && <> · pago a maior <b>{brl(r.totalExcess)}</b></>}
        {rules && <> · regras: {rules}</>}
      </p>

      {aberto && (
        <section id="prova" className="mb-6 rounded-2xl border border-line bg-white/60 p-4 md:p-5" aria-label="Prova do item">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-ink-900">Prova</h2>
            <div className="flex gap-2">
              <Link className="btn-ghost" href={`/conciliacao/${r.id}/prova/${aberto.id}`}><Icon name="file" size={16} />Imprimir / salvar PDF</Link>
              <Link className="btn-ghost" href={link({ tipo, taxa })}><Icon name="close" size={16} />Fechar</Link>
            </div>
          </div>
          <ProvaView prova={lerProva(aberto.evidence)} frase={fraseItem(paraFrase(aberto), { pagas })} />
        </section>
      )}

      {comTaxa && (
        <div className="mb-4 grid gap-2">
          <nav aria-label="Filtrar valor diferente pela taxa de cartão" className="flex flex-wrap items-center gap-2 text-sm">
            <Link className={taxa === undefined ? "btn" : "btn-ghost"} href={link({ tipo })} aria-current={taxa === undefined ? "page" : undefined}>Todos ({doGrupo.length})</Link>
            <Link className={taxa === "explicada" ? "btn" : "btn-ghost"} href={link({ tipo, taxa: "explicada" })} aria-current={taxa === "explicada" ? "page" : undefined}>{explicados} explicado(s) pela taxa</Link>
            <Link className={taxa === "outras" ? "btn" : "btn-ghost"} href={link({ tipo, taxa: "outras" })} aria-current={taxa === "outras" ? "page" : undefined}>{doGrupo.length - explicados} para resolver</Link>
          </nav>
          <Notice tone="info">&quot;Explicado pela taxa&quot; é uma pista: a diferença bate com a taxa configurada para a forma de recebimento. A situação não muda e a aceitação continua manual, item a item.</Notice>
        </div>
      )}

      <TableCard title={tipo ? ROTULO_GRUPO[tipo] : "Todos os itens"} meta={`${items.length} item(ns)`}>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className={`flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:justify-between ${aberto?.id === i.id ? "bg-brand-50/60" : ""}`}>
              <div className="min-w-0 text-sm">
                <p className="text-ink-900">{fraseItem(paraFrase(i), { pagas })}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <StatusBadge status={i.status} />
                  {i.explicadoTaxa && <Badge tone="info">Explicado pela taxa</Badge>}
                  <Link className="link-action" href={`${link({ tipo, taxa, item: i.id })}#prova`}>Ver prova</Link>
                </p>
                {(() => {
                  const t = i.status === "DIVERGENTE" ? linhasTaxa(i) : null;
                  if (!t) return null;
                  return (
                    <dl className="mt-1 grid grid-cols-[auto_auto] justify-start gap-x-4 text-xs text-ink-600">
                      <dt>Bruto esperado{i.formaPagamento ? ` (${i.formaPagamento})` : ""}</dt><dd className="num">{brl(t.bruto)}</dd>
                      <dt>Taxa</dt><dd className="num">− {brl(t.taxa)}</dd>
                      <dt>Líquido esperado</dt><dd className="num">{brl(t.liquido)}</dd>
                      <dt>Recebido</dt><dd className="num">{t.recebido === null ? "—" : brl(t.recebido)}</dd>
                    </dl>
                  );
                })()}
                {i.resolution && (
                  <p className="mt-1 text-xs text-ink-700">
                    <b>{resolucaoLabel[i.resolution] ?? i.resolution}</b>
                    {i.linkedItemId && <> com {refPorId.get(i.linkedItemId) ?? "—"}</>} · {i.resolvedByName} · {dt(i.resolvedAt)} · {i.resolutionNote}
                  </p>
                )}
                {eventos.some((e) => e.itemId === i.id) && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-ink-500">Histórico</summary>
                    <ul className="mt-1 space-y-1">
                      {eventos.filter((e) => e.itemId === i.id).map((e) => (
                        <li key={e.id}>{dt(e.createdAt)} · {e.userName} · {acaoLabel[e.action] ?? e.action} ({e.fromStatus} → {e.toStatus}) · {e.note}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              {podeEditar && (
                <div className="shrink-0">
                  <ResolverItem itemId={i.id} status={i.status} resolvido={!!i.resolution} isAdmin={s.role === "ADMIN"} opcoes={opcoes} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </TableCard>
    </>
  );
}
