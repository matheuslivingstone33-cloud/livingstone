import { apagarDocumento, atualizarDocumento, listarDocumentos } from "@/app/actions-biblioteca";
import { Badge, Empty, PageTitle, TableCard } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { ROTULO_FORMATO, type FormatoDoc } from "@/lib/biblioteca";
import { fmtDataHora } from "@/lib/tz";

export default async function BibliotecaPage() {
  const s = await requireSession();
  const podeEditar = s.role === "ADMIN" || s.role === "ANALISTA";
  const docs = await listarDocumentos();
  return (
    <>
      <PageTitle
        eyebrow="Biblioteca"
        title="Biblioteca de documentos"
        subtitle="O que cada documento da instituição significa, confirmado por uma pessoa no assistente. Anexe um arquivo no assistente para incluir um novo."
      />
      <TableCard title="Documentos confirmados" meta={<span className="text-xs text-ink-500">{docs.length}</span>}>
        {docs.length === 0 ? (
          <Empty>Nenhum documento confirmado ainda. Anexe um arquivo no assistente e confirme o entendimento.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="space-y-3 px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-[15px] font-semibold text-ink-900">{d.titulo}</h3>
                  <Badge tone="neutral">{ROTULO_FORMATO[d.formato as FormatoDoc] ?? d.formato}</Badge>
                  <span className="text-xs tabular-nums text-ink-500">Atualizado em {fmtDataHora(d.atualizadoEm)}</span>
                </div>
                <p className="whitespace-pre-line leading-relaxed text-ink-700">{d.explicacao}</p>
                {d.colunas.length > 0 && (
                  <dl className="grid gap-x-4 gap-y-1.5 rounded-lg bg-paper/70 px-3 py-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
                    {d.colunas.map((c) => (
                      <div key={c.nome} className="contents">
                        <dt className="font-medium text-ink-900">{c.nome}</dt>
                        <dd className="text-ink-700">{c.significado || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="text-xs text-ink-600">
                  <span className="font-medium">Frequência:</span> {d.frequencia || "não informada"} · <span className="font-medium">Uso:</span> {d.uso || "não informado"}
                </p>
                {podeEditar && (
                  <details className="rounded-lg border border-line px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-ink-700">Editar ou apagar</summary>
                    <form action={atualizarDocumento.bind(null, d.id)} className="mt-3 grid gap-3">
                      <div>
                        <label className="label" htmlFor={`titulo-${d.id}`}>Título</label>
                        <input className="input" id={`titulo-${d.id}`} name="titulo" defaultValue={d.titulo} maxLength={80} required minLength={3} />
                      </div>
                      <div>
                        <label className="label" htmlFor={`explicacao-${d.id}`}>Explicação</label>
                        <textarea className="input" id={`explicacao-${d.id}`} name="explicacao" defaultValue={d.explicacao} maxLength={600} rows={3} required />
                      </div>
                      {d.colunas.map((c, i) => (
                        <div key={c.nome}>
                          <label className="label" htmlFor={`col-${d.id}-${i}`}>Coluna {c.nome}</label>
                          <input className="input" id={`col-${d.id}-${i}`} name={`col_${i}`} defaultValue={c.significado} maxLength={200} />
                        </div>
                      ))}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label" htmlFor={`freq-${d.id}`}>Frequência</label>
                          <input className="input" id={`freq-${d.id}`} name="frequencia" defaultValue={d.frequencia ?? ""} maxLength={80} />
                        </div>
                        <div>
                          <label className="label" htmlFor={`uso-${d.id}`}>Uso</label>
                          <input className="input" id={`uso-${d.id}`} name="uso" defaultValue={d.uso ?? ""} maxLength={300} />
                        </div>
                      </div>
                      <div>
                        <button type="submit" className="btn">Salvar</button>
                      </div>
                    </form>
                    <form action={apagarDocumento.bind(null, d.id)} className="mt-3 border-t border-line pt-3">
                      <button type="submit" className="btn-danger">Apagar da biblioteca</button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </TableCard>
    </>
  );
}
