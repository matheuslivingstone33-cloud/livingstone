import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day, dt } from "@/lib/format";
import { TYPE_LABEL, dossierAiAvailableAt, type Alert } from "@/lib/pld";
import { aiProvider } from "@/lib/ai";
import { generateDossier, regenerateDossierAi } from "../../../actions-pld";
import { PageTitle, Stat, CardHeader, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";
import { AiVersion } from "@/components/AiVersion";
import { PLD_STATUS, RiskBadge, DueBadge } from "../badges";
import { DecisionForm } from "./DecisionForm";

// Tempo máximo da função na Vercel (actions e exportações longas)
export const maxDuration = 60;

export default async function PldCasePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const c = await db.pldCase.findFirst({ where: { id, orgId: s.orgId }, include: { batch: true } });
  if (!c) notFound();
  const alerts = c.alerts as unknown as Alert[];
  const txs = await db.pldTransaction.findMany({ where: { batchId: c.batchId, clientDoc: c.clientDoc }, orderBy: { date: "asc" } });
  const evidenceKeys = new Set(alerts.flatMap((a) => a.evidence.map((e) => `${e.date}|${e.amount}|${e.type}`)));
  const canEdit = s.role !== "AUDITOR";
  const aiOn = aiProvider() === "claude";
  const aiNextAt = dossierAiAvailableAt(c.dossierAiAt);
  const dossierStatus = c.dossierAi === "claude" && c.dossierAiText && c.dossier === c.dossierAiText ? "usada" : c.dossierAi === "ia-rejeitada" ? "rejeitada" : c.dossierAi === "ia-falhou" ? "falhou" : null;

  return (
    <>
      <PageTitle
        back={{ href: "/pld", label: "Casos de PLD" }}
        title={c.clientName}
        subtitle={`${c.clientDoc} · período ${day(c.batch.periodStart)} a ${day(c.batch.periodEnd)} · aberto em ${dt(c.createdAt)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {c.pep && <span className="badge bg-violet-50 text-violet-800">PEP</span>}
            {c.mandatory && <span className="badge bg-red-700 text-white">Comunicação obrigatória</span>}
            <span className={`badge ${PLD_STATUS[c.status][1]}`}>{PLD_STATUS[c.status][0]}</span>
          </div>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-5">
        <Stat label="Risco" value={<RiskBadge risk={c.risk} score={c.score} />} />
        <Stat label="Renda declarada" value={brl(c.declaredIncome)} />
        <Stat label="Créditos no período" value={brl(c.totalIn)} tone="green" />
        <Stat label="Débitos no período" value={brl(c.totalOut)} tone="red" />
        <Stat label="Prazo de análise" value={c.status === "EM_ANALISE" ? <DueBadge dueAt={c.dueAt} /> : "Concluído"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <section className="card">
            <CardHeader title={`Alertas (${alerts.length})`} />
            <ol className="space-y-3">
              {alerts.map((a) => (
                <li key={a.rule} className="relative rounded-xl border border-line bg-white p-4 pl-5">
                  <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-amber-400" aria-hidden="true" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="text-sm font-semibold text-ink-900">{a.title}</b>
                    <span className="badge bg-paper-2 tabular-nums text-ink-700">+{a.weight} pts</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{a.description}</p>
                  <p className="mt-1.5 text-xs text-ink-500">{a.reference}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-0 md:p-0">
            <div className="px-5 pt-5 md:px-6">
              <CardHeader title={`Transações do cliente (${txs.length})`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-200 ring-1 ring-amber-300" aria-hidden="true" />
                  Destacadas: operações citadas nos alertas.
                </span>
              </CardHeader>
            </div>
            <div className="overflow-x-auto px-2 pb-3 md:px-3">
            <table className="table">
              <thead><tr><th>Data</th><th>Tipo</th><th className="num">Valor</th><th>Contraparte</th></tr></thead>
              <tbody>
                {txs.map((t) => {
                  const hit = evidenceKeys.has(`${t.date.toISOString().slice(0, 10)}|${Number(t.amount)}|${t.type}`);
                  return (
                    <tr key={t.id} className={hit ? "bg-amber-50 hover:bg-amber-100/70" : ""}>
                      <td className="whitespace-nowrap">{dt(t.date)}</td>
                      <td>{TYPE_LABEL[t.type] ?? t.type}</td>
                      <td className={`num whitespace-nowrap font-medium ${t.direction === "C" ? "text-emerald-700" : "text-red-700"}`}>
                        {t.direction === "C" ? "+" : "−"} {brl(t.amount)}
                      </td>
                      <td className="text-ink-600">
                        {t.counterparty ?? "—"}
                        {t.counterDoc && <span className="text-xs text-ink-500"> · {t.counterDoc}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {c.status !== "EM_ANALISE" ? (
            <section className="card space-y-3 text-sm">
              <CardHeader title="Decisão registrada" />
              <p className="text-ink-700"><b className="text-ink-900">{PLD_STATUS[c.status][0]}</b> por {c.decidedBy} em {dt(c.decidedAt)}</p>
              {c.protocol && <p className="text-ink-700">Protocolo SISCOAF: <span className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-ink-900">{c.protocol}</span></p>}
              <p className="whitespace-pre-wrap rounded-xl border border-line bg-paper p-3 leading-relaxed text-ink-700">{c.decision}</p>
            </section>
          ) : (
            canEdit && <DecisionForm caseId={c.id} mandatory={c.mandatory} pepNeedsAdmin={c.pep && s.role !== "ADMIN"} />
          )}

          <section className="card space-y-3">
            <CardHeader title="Dossiê">
              {c.dossier ? (c.dossierAi === "claude" ? "redigido pelo Claude e conferido" : "modelo padrão") : undefined}
            </CardHeader>
            {c.dossier ? (
              <>
                <pre tabIndex={0} aria-label="Texto do dossiê" className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 font-sans text-xs leading-relaxed text-ink-800">{c.dossier}</pre>
                <AiVersion status={dossierStatus} base={c.dossierBase} label="Ver dossiê padrão (sem IA)" />
                <CopyButton text={c.dossier} label="Copiar dossiê" />
              </>
            ) : (
              <p className="text-sm leading-relaxed text-ink-500">Gere o dossiê com os fatos, as evidências e o enquadramento normativo para fundamentar a decisão.</p>
            )}
            {aiOn && aiNextAt && aiNextAt > new Date() && (
              <Notice tone="info">
                A IA já foi usada neste caso nas últimas 24h. Gerar novamente agora usa a versão salva; nova versão por IA disponível a partir de {dt(aiNextAt)}.
              </Notice>
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <form action={generateDossier.bind(null, c.id)}>
                  <SubmitButton pending="Gerando dossiê...">{c.dossier ? "Gerar novamente" : "Gerar dossiê"}</SubmitButton>
                </form>
                {aiOn && s.role === "ADMIN" && c.dossier && (
                  <form action={regenerateDossierAi.bind(null, c.id)}>
                    <SubmitButton pending="Regenerando com IA...">Regenerar com IA</SubmitButton>
                  </form>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
