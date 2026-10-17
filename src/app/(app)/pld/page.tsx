import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day, dt } from "@/lib/format";
import { importPld } from "../../actions-pld";
import { PageTitle, Stat, Empty, DemoFiles } from "@/components/ui";
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
      <PageTitle title="Prevenção à lavagem de dinheiro" subtitle="Monitoramento de transações, análise de casos e comunicação ao COAF (Circular BCB 3.978/2020)" />
      {lastBatch && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {lastBatch.fileName}: {lastBatch.transactions} transações de {lastBatch.clients} clientes analisadas, {lastBatch.alerts} alerta(s) gerado(s).
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Casos em análise" value={n.EM_ANALISE ?? 0} tone="amber" href="?status=EM_ANALISE" />
        <Stat label="Vencendo em 7 dias" value={overdue} tone={overdue ? "red" : "green"} />
        <Stat label="Comunicados ao COAF" value={n.COMUNICADO ?? 0} tone="blue" href="?status=COMUNICADO" />
        <Stat label="Arquivados" value={n.ARQUIVADO ?? 0} href="?status=ARQUIVADO" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {s.role !== "AUDITOR" && (
          <form action={importPld} className="card space-y-3">
            <h2 className="font-semibold">Analisar transações</h2>
            <input className="input" name="file" type="file" accept=".csv,.txt" required />
            <p className="text-xs text-slate-500">CSV: data; cliente; cpf_cnpj; renda_mensal; pep; tipo; valor; contraparte; doc_contraparte</p>
            <DemoFiles files={[{ href: "/demo/transacoes_pld.csv", label: "transações de exemplo (60 dias)" }]} />
            <SubmitButton pending="Analisando...">Analisar</SubmitButton>
          </form>
        )}
        <div className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">Regras monitoradas</h2>
          <ul className="grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
            <li>• Espécie ≥ R$ 50 mil (comunicação obrigatória)</li>
            <li>• Fracionamento de depósitos/saques em espécie</li>
            <li>• Movimentação incompatível com a renda</li>
            <li>• Conta de passagem (entra e sai em 48h)</li>
            <li>• Muitos remetentes distintos</li>
            <li>• Valores redondos repetidos</li>
            <li>• Contraparte em lista restritiva</li>
            <li>• Pessoa exposta politicamente (PEP)</li>
          </ul>
          {batches.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Último lote: {batches[0].fileName} · período {day(batches[0].periodStart)} a {day(batches[0].periodEnd)} · {dt(batches[0].createdAt)}
            </p>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {[["EM_ANALISE", "Em análise"], ["COMUNICADO", "Comunicados"], ["ARQUIVADO", "Arquivados"], ["TODOS", "Todos"]].map(([k, label]) => (
          <Link key={k} href={`?status=${k}`} className={`btn-ghost ${status === k ? "border-brand-600 text-brand-700" : ""}`}>{label}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        {cases.length ? (
          <table className="table">
            <thead>
              <tr><th>Cliente</th><th>Risco</th><th>Alertas</th><th>Créditos</th><th>Débitos</th><th>Situação</th><th>Prazo</th></tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const alerts = c.alerts as { title: string }[];
                return (
                  <tr key={c.id}>
                    <td>
                      <Link className="font-medium text-brand-600 hover:underline" href={`/pld/${c.id}`}>{c.clientName}</Link>
                      <div className="text-xs text-slate-500">
                        {c.clientDoc}
                        {c.pep && <span className="badge ml-2 bg-violet-100 text-violet-800">PEP</span>}
                        {c.mandatory && <span className="badge ml-2 bg-red-100 text-red-800">Comunicação obrigatória</span>}
                      </div>
                    </td>
                    <td><RiskBadge risk={c.risk} score={c.score} /></td>
                    <td className="max-w-xs text-xs text-slate-600">{alerts.map((a) => a.title).join(" · ")}</td>
                    <td>{brl(c.totalIn)}</td>
                    <td>{brl(c.totalOut)}</td>
                    <td><span className={`badge ${PLD_STATUS[c.status][1]}`}>{PLD_STATUS[c.status][0]}</span></td>
                    <td>{c.status === "EM_ANALISE" ? <DueBadge dueAt={c.dueAt} /> : <span className="text-xs text-slate-500">{day(c.decidedAt)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Empty>Nenhum caso nesta situação. Analise o arquivo de transações de exemplo para testar.</Empty>
        )}
      </div>
    </>
  );
}
