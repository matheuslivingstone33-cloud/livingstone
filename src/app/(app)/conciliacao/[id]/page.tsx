import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day, dt } from "@/lib/format";
import { PageTitle, Stat, StatusBadge, TableCard, FilterBar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { ReconcileOptions } from "@/lib/reconcile";
import { ResolverItem } from "./ResolverItem";

const ruleLabel: Record<string, string> = { REFERENCIA: "Referência", REFERENCIA_DV: "Referência + DV", VALOR_DATA: "Valor e data", MANUAL: "Manual" };
const resolucaoLabel: Record<string, string> = { MANUAL_VINCULO: "Vínculo manual", ACEITE_DIVERGENCIA: "Divergência aceita", BAIXA: "Baixa" };
const acaoLabel: Record<string, string> = { VINCULAR: "Vinculou", ACEITAR_DIVERGENCIA: "Aceitou divergência", BAIXAR: "Baixou", REABRIR: "Reabriu" };

const filters = [
  { key: "", label: "Todos" },
  { key: "DIVERGENTE", label: "Divergentes" },
  { key: "PENDENTE", label: "Não pagos" },
  { key: "NAO_ESPERADO", label: "Não esperados" },
  { key: "CONCILIADO", label: "Conciliados" },
  { key: "VINCULADO", label: "Vinculados" },
  { key: "BAIXADO", label: "Baixados" },
];

export default async function ConciliacaoDetalhe({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const s = await requireSession();
  const { id } = await params;
  const { status } = await searchParams;
  const r = await db.reconciliation.findFirst({ where: { id, orgId: s.orgId } });
  if (!r) notFound();
  const items = await db.reconciliationItem.findMany({
    where: { reconciliationId: id, ...(status ? { status } : {}) },
    orderBy: [{ status: "asc" }, { reference: "asc" }],
  });
  const podeEditar = s.role !== "AUDITOR";
  const naoEsperados = podeEditar
    ? await db.reconciliationItem.findMany({ where: { reconciliationId: id, status: "NAO_ESPERADO", resolution: null }, orderBy: { reference: "asc" } })
    : [];
  const opcoes = naoEsperados.map((u) => ({ id: u.id, label: `${u.reference} · ${brl(u.receivedAmount)} · ${day(u.paidAt)}` }));
  const eventos = await db.reconciliationItemEvent.findMany({ where: { reconciliationId: id, orgId: s.orgId }, orderBy: { createdAt: "asc" } });
  const refPorId = new Map((await db.reconciliationItem.findMany({ where: { reconciliationId: id }, select: { id: true, reference: true } })).map((x) => [x.id, x.reference]));
  const diff = Number(r.totalReceived) - Number(r.totalExpected);
  const opts = (r.options ?? {}) as Partial<ReconcileOptions>;
  const rules = [
    opts.toleranciaCentavos ? `tolerância de ${opts.toleranciaCentavos} centavo(s)` : "",
    opts.casarPorValorData ? `valor e data (±${opts.toleranciaDias ?? 0} dia(s))` : "",
  ].filter(Boolean).join(", ");

  return (
    <>
      <PageTitle
        back={{ href: "/conciliacao", label: "Conciliações" }}
        title={r.name}
        subtitle={`${r.bankFileName} (${r.bankFormat}) × ${r.expectedFileName} · ${dt(r.createdAt)}`}
        action={<a className="btn-ghost" href={`/api/conciliacao/${r.id}/csv`}><Icon name="download" size={16} />Exportar CSV</a>}
      />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Stat label="Esperado" value={brl(r.totalExpected)} />
        <Stat label="Recebido" value={brl(r.totalReceived)} tone="green" />
        <Stat label="Diferença" value={brl(diff)} tone={diff === 0 ? "green" : "amber"} />
        <Stat label="Conciliados" value={`${r.matched} de ${r.matched + r.divergent + r.missing}`} tone="blue" />
      </div>
      {(Number(r.totalExcess) > 0 || rules) && (
        <p className="notice notice-info block">
          {Number(r.totalExcess) > 0 && <>Pago a maior (excedente): <strong>{brl(r.totalExcess)}</strong>. </>}
          {rules && <>Regras usadas: {rules}.</>}
        </p>
      )}

      <FilterBar label="Filtrar itens por status">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `?status=${f.key}` : "?"}
            aria-current={status === f.key || (!status && !f.key) ? "page" : undefined}
            className="chip"
          >
            {f.label}
          </Link>
        ))}
      </FilterBar>

      <TableCard title="Itens" meta={`${items.length} item(ns)`}>
        <table className="table">
          <thead>
            <tr><th>Referência</th><th>Pagador</th><th className="num">Esperado</th><th className="num">Recebido</th><th>Pago em</th><th>Status</th><th>Regra</th><th>Observação</th>{podeEditar && <th>Fechamento</th>}</tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="font-mono text-xs text-ink-700">{i.reference}</td>
                <td>{i.payer ?? "—"}</td>
                <td className="num">{brl(i.expectedAmount)}</td>
                <td className="num font-medium">{brl(i.receivedAmount)}</td>
                <td className="whitespace-nowrap">{day(i.paidAt)}</td>
                <td><StatusBadge status={i.status} /></td>
                <td className="text-ink-500">{i.rule ? ruleLabel[i.rule] ?? i.rule : "—"}</td>
                <td className="text-ink-500">
                  {i.note ?? ""}
                  {i.resolution && (
                    <span className="mt-1 block text-xs text-ink-700">
                      <b>{resolucaoLabel[i.resolution] ?? i.resolution}</b>
                      {i.linkedItemId && <> com {refPorId.get(i.linkedItemId) ?? "—"}</>} · {i.resolvedByName} · {dt(i.resolvedAt)} · {i.resolutionNote}
                    </span>
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
                </td>
                {podeEditar && (
                  <td>
                    <ResolverItem itemId={i.id} status={i.status} resolvido={!!i.resolution} isAdmin={s.role === "ADMIN"} opcoes={opcoes} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}
