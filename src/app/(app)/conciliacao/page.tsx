import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, dt } from "@/lib/format";
import { createReconciliation } from "../../actions-conciliacao";
import { PageTitle, Empty, CardHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { FileSizeGuard } from "@/components/FileSizeGuard";

// Tempo máximo da função na Vercel (actions e exportações longas)
export const maxDuration = 60;

export default async function ConciliacaoPage() {
  const s = await requireSession();
  const list = await db.reconciliation.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" } });
  const canEdit = s.role !== "AUDITOR";

  return (
    <>
      <PageTitle eyebrow="Conciliação" title="Conciliação bancária" subtitle="Cruze o arquivo do banco (CNAB 400, OFX ou CSV) com os títulos esperados" />
      {canEdit && (
        <form action={createReconciliation} className="card mb-8 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <CardHeader title="Nova conciliação">Arquivo do banco × títulos esperados</CardHeader>
          </div>
          <div>
            <label className="label" htmlFor="name">Nome</label>
            <input className="input" id="name" name="name" placeholder="Ex.: Retorno Sicoob 14/10" />
          </div>
          <div>
            <label className="label" htmlFor="bankFile">Arquivo do banco (retorno/extrato)</label>
            <input className="input" id="bankFile" name="bankFile" type="file" accept=".ret,.txt,.ofx,.csv,.rem" required />
          </div>
          <div>
            <label className="label" htmlFor="expectedFile">Títulos esperados (CSV)</label>
            <input className="input" id="expectedFile" name="expectedFile" type="file" accept=".csv,.txt" required />
            <p className="hint mt-1">Até 4 MB por envio.</p>
            <FileSizeGuard inputIds={["bankFile","expectedFile"]} />
          </div>
          <details className="disclosure rounded-xl border border-line bg-paper/50 px-4 py-3 md:col-span-3">
            <summary>Regras avançadas</summary>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="label" htmlFor="toleranciaCentavos">Tolerância de valor (centavos)</label>
                <input className="input" id="toleranciaCentavos" name="toleranciaCentavos" type="number" min={0} max={100} defaultValue={0} />
                <p className="hint">Diferenças até esse valor contam como conciliadas, com observação.</p>
              </div>
              <div>
                <label className="flex min-h-10 items-center gap-2.5 text-sm font-medium text-ink-700" htmlFor="casarPorValorData">
                  <input id="casarPorValorData" name="casarPorValorData" type="checkbox" className="size-4 accent-brand-600" />
                  Casar por valor e data quando faltar a referência
                </label>
                <p className="hint">Só casa quando há um único crédito possível; se houver empate, fica para conciliação manual.</p>
              </div>
              <div>
                <label className="label" htmlFor="toleranciaDias">Tolerância de data (dias)</label>
                <input className="input" id="toleranciaDias" name="toleranciaDias" type="number" min={0} max={10} defaultValue={3} />
              </div>
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4 md:col-span-3">
            <SubmitButton pending="Conciliando...">Conciliar</SubmitButton>
          </div>
        </form>
      )}

      <section className="card p-0 md:p-0">
        <div className="px-5 pt-5 md:px-6">
          <CardHeader title="Histórico">{list.length ? `${list.length} conciliação(ões)` : undefined}</CardHeader>
        </div>
        <div className="overflow-x-auto px-2 pb-3 md:px-3">
        {list.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th><th>Formato</th><th className="num">Recebido</th><th className="num">Conciliados</th><th className="num">Divergentes</th><th className="num">Não pagos</th><th className="num">Não esperados</th><th>Data</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td><Link className="link-action" href={`/conciliacao/${r.id}`}>{r.name}</Link></td>
                  <td><span className="rounded-md bg-paper-2 px-1.5 py-0.5 font-mono text-xs text-ink-600">{r.bankFormat}</span></td>
                  <td className="num font-medium">{brl(r.totalReceived)}</td>
                  <td className="num text-emerald-700">{r.matched}</td>
                  <td className="num text-amber-700">{r.divergent}</td>
                  <td className="num text-red-700">{r.missing}</td>
                  <td className="num text-violet-700">{r.unexpected}</td>
                  <td className="whitespace-nowrap text-ink-500">{dt(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Nenhuma conciliação ainda. Envie o retorno do banco e a lista de títulos esperados para começar.</Empty>
        )}
        </div>
      </section>
    </>
  );
}
