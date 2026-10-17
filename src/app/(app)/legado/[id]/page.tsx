import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dt } from "@/lib/format";
import type { Rule } from "@/lib/legacy";
import { PageTitle, Stat } from "@/components/ui";

export default async function LegadoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const l = await db.legacyAnalysis.findFirst({ where: { id, orgId: s.orgId } });
  if (!l) notFound();
  const rules = l.rules as unknown as Rule[];

  return (
    <>
      <PageTitle title={l.fileName} subtitle={`${dt(l.createdAt)} · IA: ${l.aiProvider === "claude" ? "Claude" : "modo demonstração"}`} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Linguagem" value={l.language} />
        <Stat label="Destino" value={l.target} tone="blue" />
        <Stat label="Linhas úteis" value={l.linesOfCode} />
        <Stat label="Regras de negócio" value={rules.length} tone="green" />
      </div>
      <div className="card mb-4">
        <h2 className="mb-2 font-semibold">O que o programa faz</h2>
        <p className="text-sm leading-relaxed text-slate-700">{l.summary}</p>
      </div>
      {rules.length > 0 && (
        <div className="card mb-4 overflow-x-auto">
          <h2 className="mb-3 font-semibold">Regras de negócio identificadas</h2>
          <table className="table">
            <thead><tr><th>Rotina</th><th>Regra</th></tr></thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i}><td className="font-mono">{r.onde}</td><td>{r.regra}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {l.modernCode && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Código modernizado ({l.target})</h2>
          <pre className="max-h-[600px] overflow-auto rounded-lg bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">{l.modernCode}</pre>
        </div>
      )}
    </>
  );
}
