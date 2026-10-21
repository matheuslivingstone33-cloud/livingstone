import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day } from "@/lib/format";
import { bandOf, debtStatus, updateDebt } from "@/lib/collection";
import { getSettings } from "@/lib/settings";
import { importDebts, generateAllProposals, generateProposal } from "../../actions-cobranca";
import { PageTitle, Stat, Empty, DemoFiles, Notice, CardHeader, TableCard, FilterBar } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { FileSizeGuard } from "@/components/FileSizeGuard";

// Tempo máximo da função na Vercel (actions e exportações longas)
export const maxDuration = 60;

export default async function CobrancaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; importados?: string; propostas?: string; falhas?: string }>;
}) {
  const s = await requireSession();
  const { status, importados, propostas, falhas } = await searchParams;
  const nFalhas = Math.max(0, Math.floor(Number(falhas) || 0));
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
        eyebrow="Cobrança"
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
        <Notice>{importados ? `${importados} contrato(s) importado(s).` : `${propostas} proposta(s) gerada(s).`}</Notice>
      )}
      {propostas && nFalhas > 0 && (
        <Notice tone="warning">
          {nFalhas} contrato(s) com falha da IA ou erro no lote: as propostas geradas usaram a mensagem padrão. Os contratos com erro continuam em aberto; detalhes na auditoria.
        </Notice>
      )}


      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Stat label="Carteira em atraso (atualizada)" value={brl(carteira)} tone="red" />
        <Stat label="Contratos" value={rows.length} />
        <Stat label="Taxa de acordo" value={enviados ? `${Math.round((acordos / enviados) * 100)}%` : "—"} tone="blue" />
        <Stat label="Recuperado" value={brl(recovered._sum.paidAmount ?? 0)} tone="green" />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <CardHeader title="Carteira por faixa de atraso">Valor atualizado (contratos)</CardHeader>
          <ul className="space-y-3">
            {byBand.map((b) => (
              <li key={b.label} className="grid grid-cols-[minmax(84px,110px)_1fr] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[110px_1fr_auto]">
                <span className="text-ink-600">{b.label}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-paper-2 max-sm:order-last max-sm:col-span-2">
                  <div className="grow-x h-full rounded-full bg-brand-600" style={{ width: `${(b.total / maxBand) * 100}%` }} />
                </div>
                <span className="text-right font-medium tabular-nums text-ink-900 sm:w-40">
                  {brl(b.total)} <span className="font-normal text-ink-500">({b.count})</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-line pt-3 text-xs leading-relaxed text-ink-500">
            Política: à vista {BANDS.map((b) => `${b.label.split(" ")[0]} −${Math.round(b.cash * 100)}%`).join(" · ")}. O acordo nunca fica abaixo de {Math.round(cfg.floorPct * 100)}% do valor original. Ajuste em Configurações.
          </p>
        </section>
        {canEdit && (
          <form action={importDebts} className="card space-y-3">
            <CardHeader title="Importar carteira" />
            <input className="input" id="debts-file" name="file" type="file" accept=".csv,.txt" required />
            <p className="hint mt-1">Até 4 MB por envio.</p>
            <FileSizeGuard inputIds={["debts-file"]} />
            <p className="hint mt-0">CSV com: contrato; devedor; cpf_cnpj; telefone; email; produto; valor; vencimento</p>
            <DemoFiles files={[{ href: "/demo/carteira_inadimplentes.csv", label: "carteira de exemplo" }]} />
            <SubmitButton pending="Importando...">Importar</SubmitButton>
          </form>
        )}
      </div>

      <FilterBar label="Filtrar contratos por situação">
        {[["", "Todos"], ...Object.entries(debtStatus).map(([k, v]) => [k, v[0]])].map(([k, label]) => (
          <Link key={k} href={k ? `?status=${k}` : "?"} aria-current={(status ?? "") === k ? "page" : undefined} className="chip">
            {label}
          </Link>
        ))}
      </FilterBar>
      <TableCard title="Contratos" meta={`${list.length} contrato(s)`}>
        {list.length ? (
          <table className="table">
            <thead>
              <tr><th>Contrato</th><th>Devedor</th><th>Produto</th><th className="num">Original</th><th>Vencimento</th><th className="num">Atraso</th><th className="num">Atualizado</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td><Link className="link-action font-mono text-xs" href={`/cobranca/${d.id}`}>{d.contract}</Link></td>
                  <td className="font-medium text-ink-900">{d.debtor}</td>
                  <td className="text-ink-500">{d.product ?? "—"}</td>
                  <td className="num">{brl(d.principal)}</td>
                  <td className="whitespace-nowrap">{day(d.dueDate)}</td>
                  <td className="num whitespace-nowrap">{d.upd.days} dias</td>
                  <td className="num font-semibold text-ink-900">{brl(d.upd.total)}</td>
                  <td><span className={`badge ${debtStatus[d.status][1]}`}>{debtStatus[d.status][0]}</span></td>
                  <td>
                    {canEdit && d.status === "EM_ABERTO" && (
                      <form action={generateProposal.bind(null, d.id)}>
                        <button className="link-action whitespace-nowrap">Gerar proposta</button>
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
      </TableCard>
    </>
  );
}
