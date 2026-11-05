import Link from "next/link";
import { importarRelatorio } from "@/app/actions-demonstrativos";
import { AjudaAba } from "@/components/AjudaAba";
import { FileSizeGuard } from "@/components/FileSizeGuard";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, CardHeader, EmptyHelp, Notice, PageTitle } from "@/components/ui";
import { AJUDA } from "@/lib/ajuda";
import { requireSession } from "@/lib/auth";
import { arvoreSalva, kpisDoAno, mapaDeClasses, moedaUnica, motivoAmigavel, prepararPeriodos, type LinhaKpi } from "@/lib/consolidado";
import { db } from "@/lib/db";
import { FORMULAS, KPI_CHAVES, type Kpi, type Linhas } from "@/lib/demonstrativos";
import { fmtMoeda, isMoeda, type Moeda } from "@/lib/moeda";

export const maxDuration = 60;

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const EM_MOEDA = new Set(["ebitda", "ponto_equilibrio", "lucro_liquido_ajustado"]);
const NOME: Record<string, string> = Object.fromEntries(FORMULAS.pt.map((f) => [f.chave, f.nome]));

function Valor({ k, chave, moeda }: { k: Kpi | null | undefined; chave: string; moeda: Moeda }) {
  if (!k) return <span className="text-ink-400">—</span>;
  if (k.valor === null) return <span className="text-xs text-amber-700">{motivoAmigavel(k)}</span>;
  return <>{EM_MOEDA.has(chave) ? fmtMoeda(k.valor, moeda) : `${(k.valor * 100).toFixed(1).replace(".", ",")}%`}</>;
}

function Linha({ l, rotulo, moeda }: { l: LinhaKpi; rotulo: string; moeda: Moeda }) {
  const k = l.kpis;
  return (
    <tr>
      <th scope="row" className="whitespace-nowrap text-left">
        {rotulo}
        {l.situacao && l.situacao !== "completo" && <span className="block text-xs font-normal text-ink-500">{l.situacao}</span>}
      </th>
      {k ? (
        <>
          {KPI_CHAVES.map((c) => (
            <td key={c} className="num">
              <Valor k={k[c]} chave={c} moeda={moeda} />
            </td>
          ))}
          <td className="num">{l.lucro === null ? "—" : fmtMoeda(l.lucro, moeda)}</td>
          <td className="num">
            <Valor k={l.ajustado} chave="lucro_liquido_ajustado" moeda={moeda} />
          </td>
        </>
      ) : (
        <td colSpan={KPI_CHAVES.length + 2} className="text-xs text-ink-500">
          Nenhum mês conferido
        </td>
      )}
    </tr>
  );
}

export default async function ConsolidadoPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const s = await requireSession();
  const { ano: a } = await searchParams;
  const ano = a && /^\d{4}$/.test(a) && Number(a) >= 2000 && Number(a) <= 2100 ? Number(a) : 2026;
  const canEdit = s.role !== "AUDITOR";
  const [rows, classes] = await Promise.all([
    db.demonstrativoPeriodo.findMany({
      where: { orgId: s.orgId, OR: [{ ano }, { ano: ano - 1, mes: 12 }] },
      select: { id: true, ano: true, mes: true, status: true, moeda: true, linhas: true, contas: true },
    }),
    db.classificacaoConta.findMany({ where: { orgId: s.orgId }, select: { conta: true, classe: true } }),
  ]);
  const doAno = rows.filter((r) => r.ano === ano);
  const conferidos = doAno.filter((r) => r.status === "CONFERIDO");
  const moedaAno = moedaUnica(conferidos);
  const moedaDoMes = (m: number): Moeda => {
    const r = doAno.find((x) => x.mes === m);
    return r && isMoeda(r.moeda) ? r.moeda : "BRL";
  };
  const periodos = prepararPeriodos(
    rows.map((r) => ({ ano: r.ano, mes: r.mes, status: r.status, linhas: (r.linhas ?? {}) as Linhas, contas: arvoreSalva(r.contas) })),
    mapaDeClasses(classes),
  );
  const { meses, trimestres } = kpisDoAno(ano, periodos);
  const pendentes = classes.filter((c) => c.classe === "nao_classificada").length;

  return (
    <>
      <PageTitle
        eyebrow="Consolidado"
        title="Consolidado financeiro"
        subtitle="O resultado de cada mês, conferido por uma pessoa, e os indicadores do ano"
        action={
          <>
            <Link className="btn-ghost" href="/consolidado/classificacao">
              Classificar contas{pendentes ? ` (${pendentes} pendentes)` : ""}
            </Link>
            {moedaAno && moedaAno !== "mista" && (
              <a className="btn" href={`/api/demonstrativos/${ano}/xlsx`}>
                <Icon name="download" size={16} />
                Baixar Excel
              </a>
            )}
          </>
        }
      />
      <AjudaAba aba="consolidado" />

      <form className="mb-6 flex flex-wrap items-end gap-2" method="get">
        <div>
          <label className="label" htmlFor="ano">
            Ano
          </label>
          <input className="input w-28" id="ano" name="ano" type="number" min={2000} max={2100} defaultValue={ano} />
        </div>
        <button className="btn-ghost">Ver ano</button>
      </form>

      {moedaAno === "mista" && (
        <Notice tone="warning" role="alert" className="mb-6">
          Os meses conferidos deste ano estão em moedas diferentes. Os trimestres e o Excel só funcionam com uma única moeda: reabra o mês que está na moeda errada.
        </Notice>
      )}

      <div className="mb-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="card">
          <CardHeader title={`Meses de ${ano}`}>{conferidos.length} de 12 conferidos</CardHeader>
          {doAno.length === 0 && <EmptyHelp {...AJUDA.consolidado.vazio} />}
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {MESES.map((nome, i) => {
              const r = doAno.find((x) => x.mes === i + 1);
              const conteudo = (
                <>
                  <span className="block font-medium text-ink-900">{nome}</span>
                  {!r ? (
                    <Badge tone="muted" dot={false}>
                      vazio
                    </Badge>
                  ) : r.status === "CONFERIDO" ? (
                    <Badge tone="success">conferido</Badge>
                  ) : (
                    <Badge tone="warning">rascunho</Badge>
                  )}
                </>
              );
              return (
                <li key={nome} className="rounded-xl border border-line px-3 py-2 text-sm">
                  {r ? (
                    <Link href={`/consolidado/${r.id}`} className="block space-y-1 hover:text-brand-700">
                      {conteudo}
                    </Link>
                  ) : (
                    <div className="space-y-1">{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {canEdit && (
          <form action={importarRelatorio} className="card space-y-3">
            <CardHeader title="Enviar relatório do mês" />
            <label className="label" htmlFor="pl-arquivo">
              Profit &amp; Loss do QuickBooks (PDF de um único mês)
            </label>
            <input className="input" id="pl-arquivo" name="arquivo" type="file" accept=".pdf,application/pdf" required />
            <p className="hint mt-1">Até 4 MB. O PDF não fica guardado: guardamos só os números lidos.</p>
            <FileSizeGuard inputIds={["pl-arquivo"]} />
            <SubmitButton pending="Lendo o relatório...">Enviar</SubmitButton>
          </form>
        )}
      </div>

      <section className="card p-0 md:p-0">
        <div className="px-5 pt-5 md:px-6">
          <CardHeader title="Indicadores">Só meses conferidos · valores na moeda do relatório</CardHeader>
        </div>
        <div className="overflow-x-auto px-2 pb-3 md:px-3">
          <table className="table">
            <thead>
              <tr>
                <th>Período</th>
                {KPI_CHAVES.map((c) => (
                  <th key={c} className="num">
                    {NOME[c] ?? c}
                  </th>
                ))}
                <th className="num">Lucro líquido</th>
                <th className="num" title="Lucro líquido somando as retiradas dos sócios lançadas como despesa">
                  Lucro ajustado
                </th>
              </tr>
            </thead>
            <tbody>
              {meses.map((l, i) => (l.kpis ? <Linha key={l.rotulo} l={l} rotulo={`${MESES[i]}/${ano}`} moeda={moedaDoMes(i + 1)} /> : null))}
              {moedaAno !== "mista" && trimestres.map((l) => <Linha key={l.rotulo} l={l} rotulo={l.rotulo} moeda={moedaAno ?? "BRL"} />)}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
