import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, dt } from "@/lib/format";
import type { CreditResult, Flag } from "@/lib/credit";
import { PageTitle, Stat, StatusBadge } from "@/components/ui";

const flagTone = { alto: "border-red-300 bg-red-50 text-red-800", medio: "border-amber-300 bg-amber-50 text-amber-800", baixo: "border-slate-200 bg-slate-50 text-slate-700" };

export default async function CreditoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const c = await db.creditAnalysis.findFirst({ where: { id, orgId: s.orgId } });
  if (!c) notFound();
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
        title={c.applicant}
        subtitle={`${c.document} · ${dt(c.createdAt)} · IA: ${c.aiProvider === "claude" ? "Claude" : "modo demonstração"}`}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Valor solicitado" value={brl(c.requested)} />
        <Stat label="Score" value={c.score} tone={scoreTone} />
        <Stat label="Sugestão" value={<StatusBadge status={c.decision} />} />
        <Stat label="Pontos de atenção" value={flags.length} tone={flags.length ? "amber" : "green"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Dados extraídos dos documentos</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {fields.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-slate-500">Arquivos: {c.fileNames.join(", ")}</p>
          {x.observacoes?.map((o) => (
            <p key={o} className="mt-1 text-xs text-amber-700">{o}</p>
          ))}
        </div>
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-2 font-semibold">Parecer</h2>
            <p className="text-sm leading-relaxed text-slate-700">{c.opinion}</p>
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">Pontos de atenção</h2>
            {flags.length ? (
              <ul className="space-y-2">
                {flags.map((f, i) => (
                  <li key={i} className={`rounded-lg border px-3 py-2 text-sm ${flagTone[f.nivel]}`}>
                    <b className="uppercase">{f.nivel}</b> · {f.texto}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-700">Nenhum ponto de atenção.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
