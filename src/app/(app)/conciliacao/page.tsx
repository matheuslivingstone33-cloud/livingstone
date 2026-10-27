import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dt } from "@/lib/format";
import { moedaDe, valorNa } from "./[id]/itens";
import { confirmLayoutAndReconcile, deleteLayout, previewReconciliation } from "../../actions-conciliacao";
import { NovaConciliacao } from "@/components/NovaConciliacao";
import { PageTitle, EmptyHelp, CardHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { AjudaAba } from "@/components/AjudaAba";
import { AJUDA } from "@/lib/ajuda";

// Tempo máximo da função na Vercel (actions e exportações longas)
export const maxDuration = 60;

export default async function ConciliacaoPage() {
  const s = await requireSession();
  const [list, layouts] = await Promise.all([
    db.reconciliation.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" } }),
    db.reconLayout.findMany({ where: { orgId: s.orgId }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  const canEdit = s.role !== "AUDITOR";

  return (
    <>
      <PageTitle eyebrow="Conciliação" title="Conciliação bancária" subtitle="Cruze o arquivo do banco (CNAB 400 ou 240, OFX, CSV ou planilha) com os títulos esperados" />
      <AjudaAba aba="conciliacao" />
      {canEdit && <NovaConciliacao preview={previewReconciliation} confirm={confirmLayoutAndReconcile} />}

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
                  <td className="num font-medium">{valorNa(moedaDe(r.currency))(r.totalReceived)}</td>
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
          <EmptyHelp {...AJUDA.conciliacao.vazio} />
        )}
        </div>
      </section>

      {layouts.length > 0 && (
        <section className="card mt-8 p-0 md:p-0">
          <div className="px-5 pt-5 md:px-6">
            <CardHeader title="Formatos de planilha salvos">{`${layouts.length} formato(s)`}</CardHeader>
            <p className="hint">Arquivos com estas colunas são conciliados direto. Exclua um formato para confirmar as colunas de novo no próximo envio.</p>
          </div>
          <div className="overflow-x-auto px-2 pb-3 md:px-3">
            <table className="table">
              <thead>
                <tr><th>Arquivo</th><th>Colunas usadas</th><th>Salvo por</th><th>Atualizado</th>{canEdit && <th><span className="sr-only">Ações</span></th>}</tr>
              </thead>
              <tbody>
                {layouts.map((l) => {
                  const col = (l.layout ?? {}) as { colunas?: Record<string, string> };
                  return (
                    <tr key={l.id}>
                      <td>{l.tipo === "extrato" ? "Arquivo do banco" : "Títulos esperados"}</td>
                      <td className="text-ink-600">{Object.entries(col.colunas ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}</td>
                      <td className="text-ink-500">{l.criadoPor ?? "-"}</td>
                      <td className="whitespace-nowrap text-ink-500">{dt(l.updatedAt)}</td>
                      {canEdit && (
                        <td>
                          <form action={deleteLayout}>
                            <input type="hidden" name="id" value={l.id} />
                            <SubmitButton variant="link" pending="Excluindo...">Excluir</SubmitButton>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
