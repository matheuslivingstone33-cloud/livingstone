import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day, dt } from "@/lib/format";
import { TYPE_LABEL, type Alert } from "@/lib/pld";
import { generateDossier } from "../../../actions-pld";
import { PageTitle, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";
import { PLD_STATUS, RiskBadge, DueBadge } from "../badges";
import { DecisionForm } from "./DecisionForm";

export default async function PldCasePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const c = await db.pldCase.findFirst({ where: { id, orgId: s.orgId }, include: { batch: true } });
  if (!c) notFound();
  const alerts = c.alerts as unknown as Alert[];
  const txs = await db.pldTransaction.findMany({ where: { batchId: c.batchId, clientDoc: c.clientDoc }, orderBy: { date: "asc" } });
  const evidenceKeys = new Set(alerts.flatMap((a) => a.evidence.map((e) => `${e.date}|${e.amount}|${e.type}`)));
  const canEdit = s.role !== "AUDITOR";

  return (
    <>
      <PageTitle
        title={c.clientName}
        subtitle={`${c.clientDoc} · período ${day(c.batch.periodStart)} a ${day(c.batch.periodEnd)} · aberto em ${dt(c.createdAt)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {c.pep && <span className="badge bg-violet-100 text-violet-800">PEP</span>}
            {c.mandatory && <span className="badge bg-red-100 text-red-800">Comunicação obrigatória</span>}
            <span className={`badge ${PLD_STATUS[c.status][1]}`}>{PLD_STATUS[c.status][0]}</span>
          </div>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Risco" value={<RiskBadge risk={c.risk} score={c.score} />} />
        <Stat label="Renda declarada" value={brl(c.declaredIncome)} />
        <Stat label="Créditos no período" value={brl(c.totalIn)} tone="green" />
        <Stat label="Débitos no período" value={brl(c.totalOut)} tone="red" />
        <Stat label="Prazo de análise" value={c.status === "EM_ANALISE" ? <DueBadge dueAt={c.dueAt} /> : "Concluído"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="card">
            <h2 className="mb-3 font-semibold">Alertas ({alerts.length})</h2>
            <div className="space-y-3">
              {alerts.map((a) => (
                <div key={a.rule} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="text-sm">{a.title}</b>
                    <span className="badge bg-slate-100 text-slate-600">+{a.weight} pts</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{a.description}</p>
                  <p className="mt-1 text-xs text-slate-400">{a.reference}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <h2 className="mb-3 font-semibold">Transações do cliente ({txs.length})</h2>
            <p className="mb-2 text-xs text-slate-500">Destacadas: operações citadas nos alertas.</p>
            <table className="table">
              <thead><tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Contraparte</th></tr></thead>
              <tbody>
                {txs.map((t) => {
                  const hit = evidenceKeys.has(`${t.date.toISOString().slice(0, 10)}|${Number(t.amount)}|${t.type}`);
                  return (
                    <tr key={t.id} className={hit ? "bg-amber-50" : ""}>
                      <td className="whitespace-nowrap">{dt(t.date)}</td>
                      <td>{TYPE_LABEL[t.type] ?? t.type}</td>
                      <td className={`tabular-nums ${t.direction === "C" ? "text-emerald-700" : "text-red-700"}`}>
                        {t.direction === "C" ? "+" : "−"} {brl(t.amount)}
                      </td>
                      <td className="text-slate-600">
                        {t.counterparty ?? "—"}
                        {t.counterDoc && <span className="text-xs text-slate-400"> · {t.counterDoc}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {c.status !== "EM_ANALISE" ? (
            <div className="card space-y-2 text-sm">
              <h2 className="font-semibold">Decisão registrada</h2>
              <p><b>{PLD_STATUS[c.status][0]}</b> por {c.decidedBy} em {dt(c.decidedAt)}</p>
              {c.protocol && <p>Protocolo SISCOAF: <span className="font-mono">{c.protocol}</span></p>}
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-slate-700">{c.decision}</p>
            </div>
          ) : (
            canEdit && <DecisionForm caseId={c.id} mandatory={c.mandatory} pepNeedsAdmin={c.pep && s.role !== "ADMIN"} />
          )}

          <div className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Dossiê</h2>
              {c.dossier && <span className="text-xs text-slate-500">{c.dossierAi === "claude" ? "redigido pelo Claude" : "modelo padrão"}</span>}
            </div>
            {c.dossier ? (
              <>
                <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-700">{c.dossier}</pre>
                <CopyButton text={c.dossier} label="Copiar dossiê" />
              </>
            ) : (
              <p className="text-sm text-slate-500">Gere o dossiê com os fatos, as evidências e o enquadramento normativo para fundamentar a decisão.</p>
            )}
            {canEdit && (
              <form action={generateDossier.bind(null, c.id)}>
                <SubmitButton pending="Gerando dossiê...">{c.dossier ? "Gerar novamente" : "Gerar dossiê"}</SubmitButton>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
