import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day } from "@/lib/format";
import { bandOf, debtStatus, updateDebt } from "@/lib/collection";
import { getSettings } from "@/lib/settings";
import { importDebts, generateAllProposals, generateProposal } from "../../actions-cobranca";
import { PageTitle, Stat, Empty, DemoFiles } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function CobrancaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; importados?: string; propostas?: string }>;
}) {
  const s = await requireSession();
  const { status, importados, propostas } = await searchParams;
  const all = await db.debt.findMany({
    where: { orgId: s.orgId },
    orderBy: { dueDate: "asc" },
    include: { agreements: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const cfg = (await getSettings(s.orgId)).collection;
  const BANDS = cfg.bands;
  const rows = all.map((d) => ({ ...d, upd: updateDebt(Number(d.principal), d.dueDate, new Date(), cfg) }));
  const list = status ? rows.filter((d) => d.status === status) : rows;

  const open = rows.filter((d) => d.status !== "QUITADO");
  const carteira = open.reduce((a, d) => a + d.upd.total, 0);
  const recovered = await db.agreement.aggregate({ where: { debt: { orgId: s.orgId } }, _sum: { paidAmount: true } });
  const acordos = rows.filter((d) => d.status === "ACORDO" || d.status === "QUITADO").length;
  const enviados = rows.filter((d) => d.status !== "EM_ABERTO").length;
  const byBand = BANDS.map((b) => {
    const ds = open.filter((d) => bandOf(d.upd.days, BANDS).label === b.label && d.upd.days > 0);
    return { ...b, count: ds.length, total: ds.reduce((a, d) => a + d.upd.total, 0) };
  });
  const maxBand = Math.max(...byBand.map((b) => b.total), 1);
  const canEdit = s.role !== "AUDITOR";

  return (
    <>
      <PageTitle
        title="Cobrança e renegociação"
        subtitle="Dívida atualizada (multa 2% + juros de 1% a.m.), propostas por faixa de atraso e acordo com pagamento via Pix"
        action={
          canEdit && rows.some((d) => d.status === "EM_ABERTO") ? (
            <form action={generateAllProposals}>
              <SubmitButton pending="Gerando propostas...">Gerar propostas para todos em aberto</SubmitButton>
            </form>
          ) : undefined
        }
      />
      {(importados || propostas) && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {importados ? `${importados} contrato(s) importado(s).` : `${propostas} proposta(s) gerada(s).`}
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Carteira em atraso (atualizada)" value={brl(carteira)} tone="red" />
        <Stat label="Contratos" value={rows.length} />
        <Stat label="Taxa de acordo" value={enviados ? `${Math.round((acordos / enviados) * 100)}%` : "—"} tone="blue" />
        <Stat label="Recuperado" value={brl(recovered._sum.paidAmount ?? 0)} tone="green" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">Carteira por faixa de atraso</h2>
          <div className="space-y-2">
            {byBand.map((b) => (
              <div key={b.label} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
                <span className="text-slate-600">{b.label}</span>
                <div className="h-5 rounded bg-slate-100">
                  <div className="h-5 rounded bg-brand-600" style={{ width: `${(b.total / maxBand) * 100}%` }} />
                </div>
                <span className="w-40 text-right tabular-nums">
                  {brl(b.total)} <span className="text-slate-400">({b.count})</span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Política: à vista {BANDS.map((b) => `${b.label.split(" ")[0]} −${Math.round(b.cash * 100)}%`).join(" · ")}. O acordo nunca fica abaixo de {Math.round(cfg.floorPct * 100)}% do valor original. Ajuste em Configurações.
          </p>
        </div>
        {canEdit && (
          <form action={importDebts} className="card space-y-3">
            <h2 className="font-semibold">Importar carteira</h2>
            <input className="input" name="file" type="file" accept=".csv,.txt" required />
            <p className="text-xs text-slate-500">CSV com: contrato; devedor; cpf_cnpj; telefone; email; produto; valor; vencimento</p>
            <DemoFiles files={[{ href: "/demo/carteira_inadimplentes.csv", label: "carteira de exemplo" }]} />
            <SubmitButton pending="Importando...">Importar</SubmitButton>
          </form>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {[["", "Todos"], ...Object.entries(debtStatus).map(([k, v]) => [k, v[0]])].map(([k, label]) => (
          <Link key={k} href={k ? `?status=${k}` : "?"} className={`btn-ghost ${(status ?? "") === k ? "border-brand-600 text-brand-700" : ""}`}>
            {label}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        {list.length ? (
          <table className="table">
            <thead>
              <tr><th>Contrato</th><th>Devedor</th><th>Produto</th><th>Original</th><th>Vencimento</th><th>Atraso</th><th>Atualizado</th><th>Situação</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td className="font-mono"><Link className="text-brand-600 hover:underline" href={`/cobranca/${d.id}`}>{d.contract}</Link></td>
                  <td>{d.debtor}</td>
                  <td className="text-slate-500">{d.product ?? "—"}</td>
                  <td>{brl(d.principal)}</td>
                  <td>{day(d.dueDate)}</td>
                  <td>{d.upd.days} dias</td>
                  <td className="font-medium">{brl(d.upd.total)}</td>
                  <td><span className={`badge ${debtStatus[d.status][1]}`}>{debtStatus[d.status][0]}</span></td>
                  <td>
                    {canEdit && d.status === "EM_ABERTO" && (
                      <form action={generateProposal.bind(null, d.id)}>
                        <button className="text-sm text-brand-600 hover:underline">Gerar proposta</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Nenhum contrato. Importe a carteira de exemplo para testar.</Empty>
        )}
      </div>
    </>
  );
}
