import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dt } from "@/lib/format";
import type { Rule } from "@/lib/legacy";
import { PageTitle, Stat, CardHeader } from "@/components/ui";

export default async function LegadoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const l = await db.legacyAnalysis.findFirst({ where: { id, orgId: s.orgId } });
  if (!l) notFound();
  const rules = l.rules as unknown as Rule[];

  return (
    <>
      <PageTitle back={{ href: "/legado", label: "Código legado" }} title={l.fileName} subtitle={`${dt(l.createdAt)} · IA: ${l.aiProvider === "claude" ? "Claude" : "modo demonstração"}`} />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Stat label="Linguagem" value={l.language} />
        <Stat label="Destino" value={l.target} tone="blue" />
        <Stat label="Linhas úteis" value={l.linesOfCode} />
        <Stat label="Regras de negócio" value={rules.length} tone="green" />
      </div>
      <section className="card relative mb-4 overflow-hidden">
        <span className="absolute inset-y-0 left-0 w-1 bg-gold-400" aria-hidden="true" />
        <CardHeader title="O que o programa faz" />
        <p className="font-display max-w-3xl text-[17px] leading-relaxed text-ink-800">{l.summary}</p>
      </section>
      {rules.length > 0 && (
        <section className="card mb-4">
          <CardHeader title="Regras de negócio identificadas">{rules.length}</CardHeader>
          <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Rotina</th><th>Regra</th></tr></thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i}><td className="whitespace-nowrap font-mono text-xs text-ink-700">{r.onde}</td><td className="leading-relaxed">{r.regra}</td></tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}
      {l.modernCode && (
        <section className="card">
          <CardHeader title={`Código modernizado (${l.target})`} />
          <pre tabIndex={0} aria-label={`Código modernizado em ${l.target}`} className="max-h-[600px] overflow-auto rounded-xl border border-ink-800 bg-ink-950 p-5 font-mono text-xs leading-relaxed text-brand-100">{l.modernCode}</pre>
        </section>
      )}
    </>
  );
}
