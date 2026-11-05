import { notFound } from "next/navigation";
import { conferirPeriodo, reabrirPeriodo } from "@/app/actions-demonstrativos";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, CardHeader, Notice, PageTitle } from "@/components/ui";
import { ID_RE } from "@/lib/assistente";
import { requireSession } from "@/lib/auth";
import { T, alertasAtencao, arvoreSalva } from "@/lib/consolidado";
import { db } from "@/lib/db";
import { LINHAS, checarIdentidades, type ChaveLinha, type Linhas } from "@/lib/demonstrativos";
import { fmtMoeda, isMoeda } from "@/lib/moeda";
import { checarContas, type Alerta, type Secao } from "@/lib/plano-contas";
import { fmtDataHora } from "@/lib/tz";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SECAO: Record<Secao, string> = { income: "Receitas (Income)", cogs: "Custo do que foi vendido (COGS)", expense: "Despesas (Expense)", other_income: "Outras receitas (Other Income)", other_expense: "Outras despesas (Other Expense)" };

function Marca({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="text-emerald-700" title="A soma bate com o total impresso">✓</span>
  ) : (
    <span className="text-amber-700" title="A soma não bate com o total impresso">⚠</span>
  );
}

export default async function PeriodoPage({ params }: { params: Promise<{ periodoId: string }> }) {
  const s = await requireSession();
  const { periodoId } = await params;
  if (!ID_RE.test(periodoId)) notFound();
  const p = await db.demonstrativoPeriodo.findFirst({ where: { id: periodoId, orgId: s.orgId } });
  if (!p) notFound();
  const canEdit = s.role !== "AUDITOR";
  const moeda = isMoeda(p.moeda) ? p.moeda : "BRL";
  const v = (n: number | undefined | null) => (typeof n === "number" ? fmtMoeda(n, moeda) : "—");
  const linhas = (p.linhas ?? {}) as Linhas;
  const inferidas = new Set((Array.isArray(p.inferidas) ? p.inferidas : []) as ChaveLinha[]);
  const atencao = alertasAtencao((Array.isArray(p.alertas) ? p.alertas : []) as Alerta[]);
  const arvore = arvoreSalva(p.contas);
  const divergentes = new Set(arvore ? checarContas(arvore).divergencias.map((d) => d.chave) : []);
  const identidades = checarIdentidades(linhas);
  const fecha = identidades.every((i) => i.status === "ok");
  const conferido = p.status === "CONFERIDO";

  return (
    <>
      <PageTitle
        back={{ href: `/consolidado?ano=${p.ano}`, label: "Consolidado" }}
        title={`${MESES[p.mes - 1][0].toUpperCase()}${MESES[p.mes - 1].slice(1)} de ${p.ano}`}
        subtitle={`${p.empresa ?? "Relatório"} · Profit & Loss do QuickBooks · valores em ${moeda === "USD" ? "dólar (US$)" : "real (R$)"}`}
        action={conferido ? <Badge tone="success">conferido</Badge> : <Badge tone="warning">rascunho</Badge>}
      />

      {atencao.length > 0 && (
        <Notice tone="warning" className="mb-6">
          <p className="font-medium">Pontos de atenção</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {atencao.map((a) => (
              <li key={a.caminho}>
                {T.pt.atencao[a.codigo as "suspensa" | "distribuicao"]}: {v(a.valor)}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section className="card p-0 md:p-0">
          <div className="px-5 pt-5 md:px-6">
            <CardHeader title="Contas do relatório">✓ soma confere · ⚠ soma não confere</CardHeader>
          </div>
          <div className="overflow-x-auto px-2 pb-3 md:px-3">
            {arvore ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Conta</th>
                    <th className="num">Valor</th>
                    <th className="num">Total</th>
                    <th>
                      <span className="sr-only">Soma</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(SECAO) as Secao[]).flatMap((sec) => {
                    const contas = arvore.contas.filter((c) => c.secao === sec);
                    if (!contas.length && arvore.secoes[sec] === undefined) return [];
                    return [
                      <tr key={sec} className="bg-paper/60">
                        <th scope="rowgroup" className="text-left">{SECAO[sec]}</th>
                        <td />
                        <td className="num font-medium">{v(arvore.secoes[sec])}</td>
                        <td>{arvore.secoes[sec] !== undefined && <Marca ok={!divergentes.has(sec)} />}</td>
                      </tr>,
                      ...contas.map((c) => (
                        <tr key={c.caminho}>
                          <td style={{ paddingLeft: `${0.75 + c.nivel * 1.25}rem` }}>{c.nome}</td>
                          <td className="num">{c.filhas.length && c.valor === 0 ? "" : v(c.valor)}</td>
                          <td className="num">{c.total !== undefined ? v(c.total) : ""}</td>
                          <td>{c.total !== undefined && <Marca ok={!divergentes.has(c.caminho)} />}</td>
                        </tr>
                      )),
                    ];
                  })}
                  {(
                    [
                      ["gross_profit", "Lucro bruto (Gross Profit)"],
                      ["net_ordinary", "Resultado operacional (Net Ordinary Income)"],
                      ["net_other", "Outras receitas menos outras despesas (Net Other Income)"],
                      ["net_income", "Lucro líquido (Net Income)"],
                    ] as const
                  ).map(([k, rot]) =>
                    arvore.resumo[k] === undefined ? null : (
                      <tr key={k} className="font-medium">
                        <th scope="row" className="text-left">{rot}</th>
                        <td />
                        <td className="num">{v(arvore.resumo[k])}</td>
                        <td>
                          <Marca ok={!divergentes.has(k)} />
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            ) : (
              <p className="px-3 py-4 text-sm text-ink-500">Este mês não tem a lista de contas.</p>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="card p-0 md:p-0">
            <div className="px-5 pt-5 md:px-6">
              <CardHeader title="Resultado padronizado">{fecha ? "as somas fecham" : "as somas não fecham"}</CardHeader>
            </div>
            <div className="overflow-x-auto px-2 pb-3 md:px-3">
              <table className="table">
                <tbody>
                  {LINHAS.filter((l) => l.tipo === "fluxo" && typeof linhas[l.chave] === "number").map((l) => (
                    <tr key={l.chave}>
                      <th scope="row" className="text-left font-normal">
                        {l.rotulo}
                        {inferidas.has(l.chave) && <span className="block text-xs text-ink-500">não consta no relatório (assumido 0)</span>}
                      </th>
                      <td className="num">{v(linhas[l.chave])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!fecha && (
                <ul className="px-3 pb-2 text-xs text-amber-700">
                  {identidades
                    .filter((i) => i.status !== "ok")
                    .map((i) => (
                      <li key={i.chave}>⚠ {i.descricao}</li>
                    ))}
                </ul>
              )}
            </div>
          </section>

          <section className="card space-y-3">
            <CardHeader title="Conferência" />
            {conferido ? (
              <>
                <p className="text-sm text-ink-700">Conferido{p.conferidoEm ? ` em ${fmtDataHora(p.conferidoEm)}` : ""}. Este mês já entra nos indicadores e no Excel.</p>
                {canEdit && (
                  <form action={reabrirPeriodo.bind(null, p.id)}>
                    <SubmitButton pending="Reabrindo...">Reabrir</SubmitButton>
                  </form>
                )}
              </>
            ) : canEdit ? (
              <form action={conferirPeriodo.bind(null, p.id)} className="space-y-3">
                <p className="text-sm text-ink-700">Compare as contas com o PDF. Se estiver tudo certo, marque como conferido para o mês entrar nos indicadores.</p>
                {atencao.length > 0 && (
                  <label className="flex items-start gap-2 text-sm text-ink-800">
                    <input type="checkbox" name="aceite" className="mt-1" required />
                    Li os pontos de atenção e quero conferir mesmo assim.
                  </label>
                )}
                <SubmitButton pending="Salvando..." disabled={!fecha}>
                  Conferido, é isso
                </SubmitButton>
                {!fecha && <p className="hint">As somas não fecham: envie o relatório de novo.</p>}
              </form>
            ) : (
              <p className="text-sm text-ink-500">Aguardando conferência de um analista.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
