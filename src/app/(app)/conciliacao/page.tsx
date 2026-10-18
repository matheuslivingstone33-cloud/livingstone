import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, dt } from "@/lib/format";
import { createReconciliation } from "../../actions-conciliacao";
import { PageTitle, Empty, DemoFiles } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function ConciliacaoPage() {
  const s = await requireSession();
  const list = await db.reconciliation.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" } });
  const canEdit = s.role !== "AUDITOR";

  return (
    <>
      <PageTitle title="Conciliação bancária" subtitle="Cruze o arquivo do banco (CNAB 400, OFX ou CSV) com os títulos esperados" />
      {canEdit && (
        <form action={createReconciliation} className="card mb-6 grid gap-4 md:grid-cols-3">
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
          </div>
          <details className="md:col-span-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Regras avançadas</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <div>
                <label className="label" htmlFor="toleranciaCentavos">Tolerância de valor (centavos)</label>
                <input className="input" id="toleranciaCentavos" name="toleranciaCentavos" type="number" min={0} max={100} defaultValue={0} />
                <p className="mt-1 text-xs text-slate-500">Diferenças até esse valor contam como conciliadas, com observação.</p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm" htmlFor="casarPorValorData">
                  <input id="casarPorValorData" name="casarPorValorData" type="checkbox" />
                  Casar por valor e data quando faltar a referência
                </label>
                <p className="mt-1 text-xs text-slate-500">Só casa quando há um único crédito possível; se houver empate, fica para conciliação manual.</p>
              </div>
              <div>
                <label className="label" htmlFor="toleranciaDias">Tolerância de data (dias)</label>
                <input className="input" id="toleranciaDias" name="toleranciaDias" type="number" min={0} max={10} defaultValue={3} />
              </div>
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-3">
            <DemoFiles
              files={[
                { href: "/demo/retorno_cnab400.ret", label: "retorno CNAB 400" },
                { href: "/demo/extrato.ofx", label: "extrato OFX" },
                { href: "/demo/titulos_esperados.csv", label: "títulos esperados" },
              ]}
            />
            <SubmitButton pending="Conciliando...">Conciliar</SubmitButton>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        {list.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th><th>Formato</th><th>Recebido</th><th>Conciliados</th><th>Divergentes</th><th>Não pagos</th><th>Não esperados</th><th>Data</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td><Link className="text-brand-600 hover:underline" href={`/conciliacao/${r.id}`}>{r.name}</Link></td>
                  <td>{r.bankFormat}</td>
                  <td>{brl(r.totalReceived)}</td>
                  <td className="text-emerald-700">{r.matched}</td>
                  <td className="text-amber-700">{r.divergent}</td>
                  <td className="text-red-700">{r.missing}</td>
                  <td className="text-violet-700">{r.unexpected}</td>
                  <td className="text-slate-500">{dt(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Nenhuma conciliação. Use os arquivos de exemplo acima para testar.</Empty>
        )}
      </div>
    </>
  );
}
