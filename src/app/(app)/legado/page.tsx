import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dt } from "@/lib/format";
import { createLegacyAnalysis } from "../../actions";
import { PageTitle, Empty, DemoFiles, CardHeader, TableCard } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

// Tempo máximo da função na Vercel (actions e exportações longas)
export const maxDuration = 60;

export default async function LegadoPage() {
  const s = await requireSession();
  const list = await db.legacyAnalysis.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" } });

  return (
    <>
      <PageTitle eyebrow="Código legado" title="Modernização de código legado" subtitle="Envie COBOL, Delphi ou VB6: a IA explica, extrai as regras de negócio e gera a versão moderna" />
      {s.role !== "AUDITOR" && (
        <form action={createLegacyAnalysis} className="card mb-8 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <CardHeader title="Nova análise">COBOL, Delphi ou VB6</CardHeader>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="source">Arquivo de código</label>
            <input className="input" id="source" name="source" type="file" accept=".cbl,.cob,.cpy,.pas,.dpr,.bas,.frm,.cls,.txt" required />
          </div>
          <div>
            <label className="label" htmlFor="target">Converter para</label>
            <select className="input" id="target" name="target" defaultValue="TypeScript">
              <option>TypeScript</option>
              <option>Java</option>
              <option>C#</option>
              <option>Python</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 md:col-span-3">
            <DemoFiles files={[{ href: "/demo/CALCJUROS.cbl", label: "CALCJUROS.cbl (cálculo de juros e multa)" }]} />
            <SubmitButton pending="Analisando código...">Analisar</SubmitButton>
          </div>
        </form>
      )}

      <TableCard title="Programas analisados" meta={list.length ? `${list.length} programa(s)` : undefined}>
        {list.length ? (
          <table className="table">
            <thead>
              <tr><th>Arquivo</th><th>Linguagem</th><th>Destino</th><th className="num">Linhas</th><th className="num">Regras</th><th>Data</th></tr>
            </thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id}>
                  <td><Link className="link-action font-mono text-xs" href={`/legado/${l.id}`}>{l.fileName}</Link></td>
                  <td>{l.language}</td>
                  <td><span className="badge bg-brand-50 text-brand-800">{l.target}</span></td>
                  <td className="num">{l.linesOfCode}</td>
                  <td className="num">{(l.rules as unknown[]).length}</td>
                  <td className="whitespace-nowrap text-ink-500">{dt(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Nenhum programa analisado. Use o arquivo COBOL de exemplo para testar.</Empty>
        )}
      </TableCard>
    </>
  );
}
