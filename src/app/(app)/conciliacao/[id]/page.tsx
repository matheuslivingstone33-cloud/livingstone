import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day, dt } from "@/lib/format";
import { PageTitle, Stat, StatusBadge } from "@/components/ui";

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

  return (
    <>
      <PageTitle
        title={r.name}
        subtitle={`${r.bankFileName} (${r.bankFormat}) × ${r.expectedFileName} · ${dt(r.createdAt)}`}
        action={<a className="btn-ghost" href={`/api/conciliacao/${r.id}/csv`}>Exportar CSV</a>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Esperado" value={brl(r.totalExpected)} />
        <Stat label="Recebido" value={brl(r.totalReceived)} tone="green" />
        <Stat label="Diferença" value={brl(diff)} tone={diff === 0 ? "green" : "amber"} />
        <Stat label="Conciliados" value={`${r.matched} de ${r.matched + r.divergent + r.missing}`} tone="blue" />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `?status=${f.key}` : "?"}
            className={`btn-ghost ${status === f.key || (!status && !f.key) ? "border-brand-600 text-brand-700" : ""}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Referência</th><th>Pagador</th><th>Esperado</th><th>Recebido</th><th>Pago em</th><th>Status</th><th>Observação</th></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="font-mono">{i.reference}</td>
                <td>{i.payer ?? "—"}</td>
                <td>{brl(i.expectedAmount)}</td>
                <td>{brl(i.receivedAmount)}</td>
                <td>{day(i.paidAt)}</td>
                <td><StatusBadge status={i.status} /></td>
                <td className="text-slate-500">{i.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
