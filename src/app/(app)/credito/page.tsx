import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, dt } from "@/lib/format";
import { createCreditAnalysis } from "../../actions";
import { PageTitle, Empty, StatusBadge, DemoFiles } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function CreditoPage() {
  const s = await requireSession();
  const list = await db.creditAnalysis.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" } });

  return (
    <>
      <PageTitle title="Análise de crédito" subtitle="A IA lê os documentos, extrai os dados e aplica as regras de crédito da instituição" />
      {s.role !== "AUDITOR" && (
        <form action={createCreditAnalysis} className="card mb-6 grid gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="applicant">Solicitante</label>
            <input className="input" id="applicant" name="applicant" required />
          </div>
          <div>
            <label className="label" htmlFor="document">CPF/CNPJ</label>
            <input className="input" id="document" name="document" required />
          </div>
          <div>
            <label className="label" htmlFor="requested">Valor solicitado (R$)</label>
            <input className="input" id="requested" name="requested" inputMode="decimal" placeholder="15.000,00" required />
          </div>
          <div>
            <label className="label" htmlFor="months">Prazo (meses)</label>
            <input className="input" id="months" name="months" type="number" min={1} max={120} defaultValue={24} required />
          </div>
          <div>
            <label className="label" htmlFor="rate">Taxa (% a.m.)</label>
            <input className="input" id="rate" name="rate" inputMode="decimal" defaultValue="2,5" required />
          </div>
          <div>
            <label className="label" htmlFor="docs">Documentos (holerite, extrato…)</label>
            <input className="input" id="docs" name="docs" type="file" multiple accept=".txt,.csv,.pdf,image/*" required />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-3">
            <DemoFiles
              files={[
                { href: "/demo/holerite_maria.txt", label: "holerite (bom pagador)" },
                { href: "/demo/extrato_maria.csv", label: "extrato (bom pagador)" },
                { href: "/demo/holerite_joao.txt", label: "holerite (alto risco)" },
                { href: "/demo/extrato_joao.csv", label: "extrato (alto risco)" },
              ]}
            />
            <SubmitButton pending="Analisando documentos...">Analisar</SubmitButton>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        {list.length ? (
          <table className="table">
            <thead>
              <tr><th>Solicitante</th><th>Valor</th><th>Score</th><th>Sugestão</th><th>IA</th><th>Data</th></tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><Link className="text-brand-600 hover:underline" href={`/credito/${c.id}`}>{c.applicant}</Link></td>
                  <td>{brl(c.requested)}</td>
                  <td className="font-semibold">{c.score}</td>
                  <td><StatusBadge status={c.decision} /></td>
                  <td className="text-slate-500">{c.aiProvider === "claude" ? "Claude" : "Demonstração"}</td>
                  <td className="text-slate-500">{dt(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Nenhuma análise. Use os documentos de exemplo para testar.</Empty>
        )}
      </div>
    </>
  );
}
