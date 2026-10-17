import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dt } from "@/lib/format";
import { createLegacyAnalysis } from "../../actions";
import { PageTitle, Empty, DemoFiles } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function LegadoPage() {
  const s = await requireSession();
  const list = await db.legacyAnalysis.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" } });

  return (
    <>
      <PageTitle title="Modernização de código legado" subtitle="Envie COBOL, Delphi ou VB6: a IA explica, extrai as regras de negócio e gera a versão moderna" />
      {s.role !== "AUDITOR" && (
        <form action={createLegacyAnalysis} className="card mb-6 grid gap-4 md:grid-cols-3">
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
          <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-3">
            <DemoFiles files={[{ href: "/demo/CALCJUROS.cbl", label: "CALCJUROS.cbl (cálculo de juros e multa)" }]} />
            <SubmitButton pending="Analisando código...">Analisar</SubmitButton>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        {list.length ? (
          <table className="table">
            <thead>
              <tr><th>Arquivo</th><th>Linguagem</th><th>Destino</th><th>Linhas</th><th>Regras</th><th>Data</th></tr>
            </thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id}>
                  <td><Link className="text-brand-600 hover:underline" href={`/legado/${l.id}`}>{l.fileName}</Link></td>
                  <td>{l.language}</td>
                  <td>{l.target}</td>
                  <td>{l.linesOfCode}</td>
                  <td>{(l.rules as unknown[]).length}</td>
                  <td className="text-slate-500">{dt(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Nenhum programa analisado. Use o arquivo COBOL de exemplo para testar.</Empty>
        )}
      </div>
    </>
  );
}
