import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, dt } from "@/lib/format";
import type { CreditResult, Flag } from "@/lib/credit";
import { PageTitle, Stat, StatusBadge, CardHeader } from "@/components/ui";
import { AiVersion } from "@/components/AiVersion";
import { rotuloSugestaoXDecisao } from "@/lib/credito-decisao";
import { DecisaoForm } from "./DecisaoForm";

const flagTone = { alto: "border-red-200 bg-red-50 text-red-900", medio: "border-amber-200 bg-amber-50 text-amber-900", baixo: "border-line bg-paper text-ink-700" };
const flagDot = { alto: "bg-red-500", medio: "bg-amber-500", baixo: "bg-slate-400" };
const scoreBar = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" };

export default async function CreditoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const c = await db.creditAnalysis.findFirst({ where: { id, orgId: s.orgId } });
  if (!c) notFound();
  const eventos = await db.creditDecisionEvent.findMany({ where: { analysisId: c.id, orgId: s.orgId }, orderBy: { createdAt: "asc" } });
  const x = c.extracted as unknown as CreditResult["extracted"];
  const flags = c.flags as unknown as Flag[];
  const scoreTone = c.score >= 700 ? "green" : c.score >= 450 ? "amber" : "red";

  const fields: [string, React.ReactNode][] = [
    ["Nome nos documentos", x.nomeNosDocumentos ?? "—"],
    ["CPF/CNPJ nos documentos", x.documentoNosDocumentos ?? "—"],
    ["Empregador", x.empregador ?? "—"],
    ["Renda líquida (holerite)", brl(x.rendaMensal)],
    ["Média de créditos (extrato)", brl(x.mediaCreditosMensais)],
    ["Despesas mensais (extrato)", brl(x.despesasRecorrentes)],
    ["Parcela estimada", brl(x.parcelaEstimada)],
    ["Comprometimento da renda", x.comprometimento ? `${(x.comprometimento * 100).toFixed(1)}%` : "—"],
  ];

  return (
    <>
      <PageTitle
        back={{ href: "/credito", label: "Análises de crédito" }}
        title={c.applicant}
        subtitle={`${c.document} · ${dt(c.createdAt)} · IA: ${c.aiProvider === "claude" ? "Claude" : c.aiProvider === "demo-fallback" ? "leitura local (IA indisponível)" : "regras locais (sem IA)"}`}
        action={<StatusBadge status={c.decision} />}
      />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Stat label="Valor solicitado" value={brl(c.requested)} />
        <Stat
          label="Score"
          value={c.score}
          tone={scoreTone}
          hint={
            <span className="mt-1 block">
              <span className="block h-1.5 overflow-hidden rounded-full bg-paper-2" role="img" aria-label={`Score ${c.score} de 1000`}>
                <span className={`grow-x block h-full rounded-full ${scoreBar[scoreTone]}`} style={{ width: `${Math.min(100, Math.max(0, c.score / 10))}%` }} />
              </span>
              <span className="mt-1 block">Escala de 0 a 1000</span>
            </span>
          }
        />
        <Stat label="Sugestão" value={<StatusBadge status={c.decision} />} />
        <Stat label="Pontos de atenção" value={flags.length} tone={flags.length ? "amber" : "green"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <CardHeader title="Dados extraídos dos documentos" />
          <dl className="divide-y divide-line text-sm">
            {fields.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[1fr_auto] gap-4 py-2.5 sm:grid-cols-2">
                <dt className="text-ink-500">{k}</dt>
                <dd className="text-right font-medium tabular-nums text-ink-900 sm:text-left">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 rounded-xl bg-paper px-3 py-2 text-xs text-ink-500">
            <span className="font-medium text-ink-600">Arquivos:</span> {c.fileNames.join(", ")}
          </p>
          {x.observacoes?.map((o) => (
            <p key={o} className="mt-2 text-xs text-amber-800">{o}</p>
          ))}
        </section>
        <div className="space-y-4">
          <section className="card relative overflow-hidden">
            <span className="absolute inset-y-0 left-0 w-1 bg-gold-400" aria-hidden="true" />
            <CardHeader title="Parecer" />
            <p className="font-display text-[17px] leading-relaxed text-ink-800">{c.opinion}</p>
            <AiVersion status={c.aiStatus} base={c.opinionBase} label="Ver parecer padrão (sem IA)" />
          </section>
          <section className="card">
            <CardHeader title="Pontos de atenção">{flags.length ? `${flags.length}` : undefined}</CardHeader>
            {flags.length ? (
              <ul className="space-y-2">
                {flags.map((f, i) => (
                  <li key={i} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${flagTone[f.nivel]}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${flagDot[f.nivel]}`} aria-hidden="true" />
                    <span>
                      <b className="text-xs font-semibold uppercase tracking-wide">{f.nivel}</b> · {f.texto}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-700">Nenhum ponto de atenção.</p>
            )}
          </section>
        </div>
      </div>

      <section className="card mt-4">
        <CardHeader title="Decisão humana">{rotuloSugestaoXDecisao(c.decision, c.finalDecision)}</CardHeader>
        <p className="mb-3 text-xs text-ink-500">A sugestão automática acima não decide sozinha: a decisão final é de uma pessoa e fica registrada na auditoria.</p>
        {c.finalDecision ? (
          <div className="mb-4 space-y-1 text-sm">
            <p><StatusBadge status={c.finalDecision} /> por <b>{c.decidedByName}</b> em {dt(c.decidedAt)}</p>
            <p className="text-ink-700">{c.justification}</p>
          </div>
        ) : null}
        {s.role !== "AUDITOR" && (!c.finalDecision || s.role === "ADMIN") && (
          <DecisaoForm analysisId={c.id} atual={c.finalDecision} revisao={!!c.finalDecision} />
        )}
        {!c.finalDecision && s.role === "AUDITOR" && <p className="text-sm text-ink-500">Aguardando decisão de um analista.</p>}
        {eventos.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-ink-500">Histórico ({eventos.length})</summary>
            <ul className="mt-2 space-y-1">
              {eventos.map((e) => (
                <li key={e.id}>{dt(e.createdAt)} · {e.userName} · {e.fromDecision ? `${e.fromDecision} → ` : ""}{e.toDecision} · {e.justification}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </>
  );
}
