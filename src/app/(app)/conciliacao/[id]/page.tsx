import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day, dt } from "@/lib/format";
import { PageTitle, Stat, StatusBadge, TableCard, FilterBar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { ReconcileOptions } from "@/lib/reconcile";

const ruleLabel: Record<string, string> = { REFERENCIA: "Referência", REFERENCIA_DV: "Referência + DV", VALOR_DATA: "Valor e data" };

const filters = [
  { key: "", label: "Todos" },
  { key: "DIVERGENTE", label: "Divergentes" },
  { key: "PENDENTE", label: "Não pagos" },
  { key: "NAO_ESPERADO", label: "Não esperados" },
  { key: "CONCILIADO", label: "Conciliados" },
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
            <tr><th>Referência</th><th>Pagador</th><th className="num">Esperado</th><th className="num">Recebido</th><th>Pago em</th><th>Status</th><th>Regra</th><th>Observação</th></tr>
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
                <td className="text-ink-500">{i.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}
