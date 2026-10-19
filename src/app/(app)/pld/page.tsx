import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day, dt } from "@/lib/format";
import { importPld } from "../../actions-pld";
import { PageTitle, Stat, Empty, DemoFiles, Notice, CardHeader, TableCard, FilterBar } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PLD_STATUS, RiskBadge, DueBadge } from "./badges";

export default async function PldPage({ searchParams }: { searchParams: Promise<{ status?: string; lote?: string }> }) {
  const s = await requireSession();
  const { status = "EM_ANALISE", lote } = await searchParams;
  const where = { orgId: s.orgId };
  const [cases, counts, batches, overdue] = await Promise.all([
    db.pldCase.findMany({
      where: { ...where, ...(status !== "TODOS" ? { status } : {}) },
      orderBy: [{ mandatory: "desc" }, { score: "desc" }, { dueAt: "asc" }],
    }),
    db.pldCase.groupBy({ by: ["status"], where, _count: true }),
    db.pldBatch.findMany({ where, orderBy: { createdAt: "desc" }, take: 5 }),
    db.pldCase.count({ where: { ...where, status: "EM_ANALISE", dueAt: { lt: new Date(Date.now() + 7 * 86_400_000) } } }),
  ]);
  const n = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const lastBatch = lote ? batches.find((b) => b.id === lote) : undefined;

  return (
    <>
      <PageTitle eyebrow="PLD / COAF" title="Prevenção à lavagem de dinheiro" subtitle="Monitoramento de transações, análise de casos e comunicação ao COAF (Circular BCB 3.978/2020)" />
      {lastBatch && (
        <Notice>
          {lastBatch.fileName}: {lastBatch.transactions} transações de {lastBatch.clients} clientes analisadas, {lastBatch.alerts} alerta(s) gerado(s).
        </Notice>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Stat label="Casos em análise" value={n.EM_ANALISE ?? 0} tone="amber" href="?status=EM_ANALISE" />
        <Stat label="Vencendo em 7 dias" value={overdue} tone={overdue ? "red" : "green"} />
        <Stat label="Comunicados ao COAF" value={n.COMUNICADO ?? 0} tone="blue" href="?status=COMUNICADO" />
        <Stat label="Arquivados" value={n.ARQUIVADO ?? 0} href="?status=ARQUIVADO" />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        {s.role !== "AUDITOR" && (
          <form action={importPld} className="card space-y-3">
            <CardHeader title="Analisar transações" />
            <input className="input" name="file" type="file" accept=".csv,.txt" required />
            <p className="hint mt-0">CSV: data; cliente; cpf_cnpj; renda_mensal; pep; tipo; valor; contraparte; doc_contraparte</p>
            <DemoFiles files={[{ href: "/demo/transacoes_pld.csv", label: "transações de exemplo (60 dias)" }]} />
            <SubmitButton pending="Analisando...">Analisar</SubmitButton>
          </form>
        )}
        <section className={`card ${s.role !== "AUDITOR" ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <CardHeader title="Regras monitoradas">8 regras</CardHeader>
          <ol className="grid gap-x-6 gap-y-2.5 text-sm text-ink-700 sm:grid-cols-2">
            {[
              "Espécie ≥ R$ 50 mil (comunicação obrigatória)",
              "Fracionamento de depósitos/saques em espécie",
              "Movimentação incompatível com a renda",
              "Conta de passagem (entra e sai em 48h)",
              "Muitos remetentes distintos",
              "Valores redondos repetidos",
              "Contraparte em lista restritiva",
              "Pessoa exposta politicamente (PEP)",
            ].map((r, i) => (
              <li key={r} className="flex items-start gap-3">
                <span className="font-display mt-px w-5 shrink-0 text-right text-sm tabular-nums text-gold-600">{i + 1}</span>
                {r}
              </li>
            ))}
          </ol>
          {batches.length > 0 && (
            <p className="mt-5 border-t border-line pt-3 text-xs text-ink-500">
              Último lote: {batches[0].fileName} · período {day(batches[0].periodStart)} a {day(batches[0].periodEnd)} · {dt(batches[0].createdAt)}
            </p>
          )}
        </section>
      </div>

      <FilterBar label="Filtrar casos por situação">
        {[["EM_ANALISE", "Em análise"], ["COMUNICADO", "Comunicados"], ["ARQUIVADO", "Arquivados"], ["TODOS", "Todos"]].map(([k, label]) => (
          <Link key={k} href={`?status=${k}`} aria-current={status === k ? "page" : undefined} className="chip">{label}</Link>
        ))}
      </FilterBar>
      <TableCard title="Casos" meta={`${cases.length} caso(s)`}>
        {cases.length ? (
          <table className="table">
            <thead>
              <tr><th>Cliente</th><th>Risco</th><th>Alertas</th><th className="num">Créditos</th><th className="num">Débitos</th><th>Situação</th><th>Prazo</th></tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const alerts = c.alerts as { title: string }[];
                return (
                  <tr key={c.id}>
                    <td>
                      <Link className="link-action" href={`/pld/${c.id}`}>{c.clientName}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                        <span className="font-mono">{c.clientDoc}</span>
                        {c.pep && <span className="badge bg-violet-50 text-violet-800">PEP</span>}
                        {c.mandatory && <span className="badge bg-red-50 text-red-800">Comunicação obrigatória</span>}
                      </div>
                    </td>
                    <td><RiskBadge risk={c.risk} score={c.score} /></td>
                    <td className="min-w-48 max-w-xs text-xs leading-relaxed text-ink-600">{alerts.map((a) => a.title).join(" · ")}</td>
                    <td className="num text-emerald-700">{brl(c.totalIn)}</td>
                    <td className="num text-red-700">{brl(c.totalOut)}</td>
                    <td><span className={`badge ${PLD_STATUS[c.status][1]}`}>{PLD_STATUS[c.status][0]}</span></td>
                    <td>{c.status === "EM_ANALISE" ? <DueBadge dueAt={c.dueAt} /> : <span className="text-xs text-ink-500">{day(c.decidedAt)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Empty>Nenhum caso nesta situação. Analise o arquivo de transações de exemplo para testar.</Empty>
        )}
      </TableCard>
    </>
  );
}
