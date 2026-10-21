import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, dt } from "@/lib/format";
import { createCreditAnalysis } from "../../actions";
import { PageTitle, Empty, StatusBadge, CardHeader, TableCard } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { FileSizeGuard } from "@/components/FileSizeGuard";

// Tempo máximo da função na Vercel (actions e exportações longas)
export const maxDuration = 60;

export default async function CreditoPage() {
  const s = await requireSession();
  const list = await db.creditAnalysis.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" } });

  return (
    <>
      <PageTitle eyebrow="Crédito" title="Análise de crédito" subtitle="A IA lê os documentos, extrai os dados e aplica as regras de crédito da instituição" />
      {s.role !== "AUDITOR" && (
        <form action={createCreditAnalysis} className="card mb-8 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <CardHeader title="Nova análise">Dados da proposta e documentos do solicitante</CardHeader>
          </div>
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
            <p className="hint mt-1">Até 4 MB por envio.</p>
            <FileSizeGuard inputIds={["docs"]} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4 md:col-span-3">
            <SubmitButton pending="Analisando documentos...">Analisar</SubmitButton>
          </div>
        </form>
      )}

      <TableCard title="Análises" meta={list.length ? `${list.length} análise(s)` : undefined}>
        {list.length ? (
          <table className="table">
            <thead>
              <tr><th>Solicitante</th><th className="num">Valor</th><th className="num">Score</th><th>Sugestão</th><th>IA</th><th>Data</th></tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><Link className="link-action" href={`/credito/${c.id}`}>{c.applicant}</Link></td>
                  <td className="num">{brl(c.requested)}</td>
                  <td className="num font-semibold">{c.score}</td>
                  <td><StatusBadge status={c.decision} /></td>
                  <td className="text-ink-500">{c.aiProvider === "claude" ? "Claude" : "Regras locais"}</td>
                  <td className="whitespace-nowrap text-ink-500">{dt(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Nenhuma análise ainda. Preencha a proposta e anexe os documentos do solicitante para começar.</Empty>
        )}
      </TableCard>
    </>
  );
}
