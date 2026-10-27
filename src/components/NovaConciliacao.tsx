"use client";
// Formulário da nova conciliação com prévia das colunas. Os arquivos ficam só no navegador:
// na confirmação, o mesmo envio é refeito com o layout escolhido (o servidor não guarda o arquivo).
import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { FileSizeGuard } from "@/components/FileSizeGuard";
import { CardHeader, Notice } from "@/components/ui";
import type { PreviaArquivo, ResultadoPrevia, TipoLayout } from "@/lib/layout-conciliacao";
import { FORMATOS_DATA, FORMATOS_VALOR, MOEDAS, ROTULO_MOEDA, fmtMoeda, isMoeda, type FormatoData, type FormatoValor, type Moeda } from "@/lib/moeda";

type Acao = (form: FormData) => Promise<ResultadoPrevia>;
/** moeda: "" até o usuário escolher (só vem marcada quando o sistema detectou os símbolos). */
type Escolha = { colunas: Record<string, string>; formatoData: string; formatoValor: string; moeda: string };
const VAZIA: Escolha = { colunas: {}, formatoData: "", formatoValor: "", moeda: "" };

const ROTULO_DATA: Record<FormatoData, string> = {
  "dd/mm/aaaa": "dd/mm/aaaa (dia primeiro: 05/10/2026 é 5 de outubro)",
  "aaaa-mm-dd": "aaaa-mm-dd (2026-10-05)",
  "mm/dd/aaaa": "mm/dd/aaaa (mês primeiro, como nos EUA: 10/05/2026 é 5 de outubro)",
  "dd-mm-aaaa": "dd-mm-aaaa (05-10-2026)",
  "dd.mm.aaaa": "dd.mm.aaaa (05.10.2026)",
  aaaammdd: "aaaammdd (20261005)",
  "mmm dd, aaaa": "mmm dd, aaaa (Oct 05, 2026)",
  "dd-mmm-aaaa": "dd-mmm-aaaa (05-Oct-2026)",
};
const ROTULO_VALOR: Record<FormatoValor, string> = {
  br: "1.234,56 (vírgula decimal)",
  ponto: "1234.56 (ponto decimal, sem milhar)",
  us: "1,234.56 (formato dos EUA)",
};
const CAMPOS: Record<TipoLayout, { k: string; rotulo: string; obrigatorio?: boolean }[]> = {
  esperados: [
    { k: "referencia", rotulo: "Referência (nosso número)", obrigatorio: true },
    { k: "valor", rotulo: "Valor", obrigatorio: true },
    { k: "data", rotulo: "Vencimento" },
    { k: "pagador", rotulo: "Pagador" },
    { k: "forma", rotulo: "Forma de recebimento (cartão, Pix, boleto)" },
  ],
  extrato: [
    { k: "referencia", rotulo: "Referência / documento", obrigatorio: true },
    { k: "valor", rotulo: "Valor", obrigatorio: true },
    { k: "data", rotulo: "Data do crédito" },
    { k: "pagador", rotulo: "Pagador" },
    { k: "descricao", rotulo: "Histórico" },
    { k: "sinal", rotulo: "Débito/crédito (D/C)" },
  ],
};
/** Frase curta de cada campo do sistema, mostrada ao lado da coluna mapeada. */
const DESCRICAO: Record<TipoLayout, Record<string, string>> = {
  esperados: {
    referencia: "Referência: o número que identifica o título (nosso número).",
    valor: "Valor: quanto você esperava receber.",
    data: "Vencimento: quando o título vence.",
    pagador: "Pagador: quem deve pagar.",
    forma: "Forma de recebimento: cartão, Pix ou boleto; usada para conferir a taxa de cartão.",
  },
  extrato: {
    referencia: "Referência: o número que identifica o crédito no banco.",
    valor: "Valor: quanto caiu na conta.",
    data: "Data do crédito: quando o dinheiro entrou.",
    pagador: "Pagador: quem pagou.",
    descricao: "Histórico: texto do lançamento; vira o pagador quando não há nome.",
    sinal: "Débito/crédito: separa entradas (C) de saídas (D).",
  },
};
/** Campo do sistema mapeado para a coluna (ou "" se ignorada). */
const campoDe = (e: Escolha, h: string) => Object.keys(e.colunas).find((k) => e.colunas[k] === h) ?? "";
/** Cada coluna tem no máximo um campo e cada campo no máximo uma coluna. */
function mapear(colunas: Record<string, string>, h: string, campo: string) {
  const out = Object.fromEntries(Object.entries(colunas).filter(([, v]) => v !== h));
  if (campo) out[campo] = h;
  return out;
}
const faltando = (tipo: TipoLayout, e: Escolha) => [
  ...CAMPOS[tipo].filter((c) => c.obrigatorio && !e.colunas[c.k]).map((c) => c.rotulo.toLowerCase()),
  ...(e.formatoData ? [] : ["formato da data"]),
  ...(e.formatoValor ? [] : ["formato do valor"]),
  ...(e.moeda ? [] : ["moeda da planilha"]),
];

const TITULO: Record<TipoLayout, string> = { esperados: "1. O que você esperava receber", extrato: "2. O que caiu no banco" };
const LAYOUT_CAMPO: Record<TipoLayout, string> = { esperados: "layoutEsperados", extrato: "layoutExtrato" };

const escolhaDe = (p: PreviaArquivo): Escolha => ({
  colunas: Object.fromEntries(Object.entries(p.colunas).filter(([, v]) => v)) as Record<string, string>,
  formatoData: p.formatoData ?? "",
  formatoValor: p.formatoValor ?? "",
  moeda: p.moeda ?? "",
});

const valorEm = (n: number | undefined, moeda: string) => (n === undefined ? "" : fmtMoeda(n, isMoeda(moeda) ? moeda : "BRL"));

export function NovaConciliacao({ preview, confirm }: { preview: Acao; confirm: Acao }) {
  const [envio, setEnvio] = useState<FormData | null>(null);
  const [previas, setPrevias] = useState<PreviaArquivo[]>([]);
  const [escolhas, setEscolhas] = useState<Partial<Record<TipoLayout, Escolha>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [moedasFixas, setMoedasFixas] = useState<Partial<Record<TipoLayout, Moeda>>>({});
  const [precisaCotacao, setPrecisaCotacao] = useState(false);
  const [cotacao, setCotacao] = useState("");
  const [toleranciaCambio, setToleranciaCambio] = useState("0,5");

  // Moeda de cada lado: a escolhida na prévia ou a do arquivo já conhecido (OFX/CNAB/CSV antigo/layout salvo)
  const moedaDe = (tipo: TipoLayout) => (previas.some((p) => p.tipo === tipo) ? escolhas[tipo]?.moeda ?? "" : moedasFixas[tipo] ?? "");
  const moedaEsp = moedaDe("esperados");
  const moedaExt = moedaDe("extrato");
  const difere = !!moedaEsp && !!moedaExt && moedaEsp !== moedaExt;
  // Confirmação bloqueada enquanto faltar campo obrigatório, formato, moeda ou (com moedas diferentes) a cotação
  const bloqueado = previas.some((p) => faltando(p.tipo, escolhas[p.tipo] ?? VAZIA).length > 0) || (difere && !cotacao.trim());

  const aplicar = (r: ResultadoPrevia, manter = false) => {
    if (!r) return;
    if (!r.ok) return setErro(r.erro);
    setErro(null);
    setPrevias(r.previas);
    setMoedasFixas(r.moedasFixas ?? {});
    setPrecisaCotacao(!!r.precisaCotacao);
    if (!manter) setEscolhas(Object.fromEntries(r.previas.map((p) => [p.tipo, escolhaDe(p)])));
  };

  const comLayouts = (base: FormData) => {
    const fd = new FormData();
    base.forEach((v, k) => {
      if (k !== "layoutEsperados" && k !== "layoutExtrato") fd.append(k, v);
    });
    for (const p of previas) {
      const e = escolhas[p.tipo];
      if (e) fd.set(LAYOUT_CAMPO[p.tipo], JSON.stringify(e));
    }
    fd.delete("cotacao");
    fd.delete("toleranciaCambioPct");
    if (difere) {
      fd.set("cotacao", cotacao.trim());
      fd.set("toleranciaCambioPct", toleranciaCambio.trim());
    }
    return fd;
  };

  async function enviar(fd: FormData) {
    setEnvio(fd);
    setPrevias([]);
    setPrecisaCotacao(false);
    aplicar(await preview(fd));
  }
  async function atualizar() {
    if (envio) aplicar(await preview(comLayouts(envio)), true);
  }
  async function confirmar() {
    if (envio && !bloqueado) aplicar(await confirm(comLayouts(envio)), true);
  }

  const mudar = (tipo: TipoLayout, f: (e: Escolha) => Escolha) =>
    setEscolhas((s) => ({ ...s, [tipo]: f(s[tipo] ?? VAZIA) }));

  return (
    <div className="mb-8 grid gap-4">
      <form action={enviar} className="card grid gap-4 md:grid-cols-3">
        <div className="md:col-span-3">
          <CardHeader title="Nova conciliação">Compare o que você esperava receber com o que caiu no banco</CardHeader>
          <p className="hint mt-1">
            São dois arquivos, um em cada campo. O sistema confere os dois e mostra o que foi pago, o que veio com valor diferente e o que não chegou.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="name">Nome (opcional)</label>
          <input className="input" id="name" name="name" placeholder="Ex.: Retorno Sicoob 14/10" />
        </div>
        <div>
          <label className="label" htmlFor="expectedFile">1. O que você esperava receber</label>
          <p className="hint mb-1">Sua lista de cobranças: boletos ou títulos emitidos, com valor e vencimento.</p>
          <input className="input" id="expectedFile" name="expectedFile" type="file" accept=".csv,.txt,.xlsx" required />
          <a className="link-action mt-1 inline-block text-xs" href="/demo/esperados_cooperativa.csv" download>Baixar exemplo</a>
        </div>
        <div>
          <label className="label" htmlFor="bankFile">2. O que caiu no banco</label>
          <p className="hint mb-1">O extrato ou o arquivo de retorno que o banco envia.</p>
          <input className="input" id="bankFile" name="bankFile" type="file" accept=".ret,.txt,.ofx,.csv,.rem,.xlsx" required />
          <a className="link-action mt-1 inline-block text-xs" href="/demo/extrato_cooperativa.xlsx" download>Baixar exemplo</a>
          <p className="hint mt-1">Até 4 MB por envio.</p>
          <FileSizeGuard inputIds={["bankFile", "expectedFile"]} />
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
        {erro && !previas.length && (
          <div className="md:col-span-3">
            <Notice tone="danger" role="alert">{erro}</Notice>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4 md:col-span-3">
          <SubmitButton pending="Lendo os arquivos..." hint="Lendo os arquivos e conferindo as colunas.">Conciliar</SubmitButton>
        </div>
      </form>

      {(previas.length > 0 || precisaCotacao) && (
        <section className="card grid gap-6" aria-labelledby="previa-titulo">
          <div>
            <h2 id="previa-titulo" className="text-lg font-semibold">{previas.length ? "Confira as colunas" : "Informe a cotação"}</h2>
            <p className="hint">
              {previas.length
                ? "É a primeira vez que este formato de planilha aparece. Confira o campo de cada coluna, corrija o que estiver errado e veja as primeiras linhas. A conciliação só roda depois de você salvar o layout; os próximos arquivos com as mesmas colunas são conciliados direto."
                : "Os dois arquivos já são conhecidos, mas estão em moedas diferentes."}
            </p>
          </div>
          {previas.map((p) => {
            const e = escolhas[p.tipo] ?? VAZIA;
            return (
              <div key={p.tipo} className="grid gap-3">
                <h3 className="font-semibold">
                  {TITULO[p.tipo]} <span className="font-normal text-ink-500">· {p.arquivo}</span>
                </h3>
                <p className="hint">
                  {p.origem === "ia" ? "Sugestão da IA, feita só com os nomes das colunas e uma amostra sem os dados reais." : p.origem === "heuristica" ? "Sugestão pelos nomes das colunas." : "Colunas escolhidas por você."}
                  {p.motivos.length ? ` ${p.motivos.join(". ")}.` : ""}
                </p>
                <div className="overflow-x-auto">
                  <table className="table">
                    <caption className="sr-only">Colunas de {p.arquivo} e o campo de cada uma</caption>
                    <thead>
                      <tr><th>Coluna do arquivo</th><th>Exemplos (mascarados)</th><th>Campo do sistema</th><th>Para que serve</th></tr>
                    </thead>
                    <tbody>
                      {p.cabecalho.map((h, ci) => {
                        const campo = campoDe(e, h);
                        const id = `${p.tipo}-col-${ci}`;
                        return (
                          <tr key={h} className={campo ? "" : "bg-amber-50/70"}>
                            <td className="font-medium text-ink-900">{h}</td>
                            <td className="font-mono text-xs text-ink-500">{(p.amostras?.[ci] ?? []).join(" · ") || "—"}</td>
                            <td>
                              {!campo && <label className="mb-1 block text-xs font-semibold text-amber-800" htmlFor={id}>O que é esta coluna?</label>}
                              <select
                                id={id}
                                className="input"
                                aria-label={campo ? `Campo da coluna ${h}` : undefined}
                                value={campo}
                                onChange={(ev) => mudar(p.tipo, (x) => ({ ...x, colunas: mapear(x.colunas, h, ev.target.value) }))}
                              >
                                <option value="">Ignorar</option>
                                {CAMPOS[p.tipo].map((c) => (
                                  <option key={c.k} value={c.k}>{c.rotulo}{c.obrigatorio ? " *" : ""}</option>
                                ))}
                              </select>
                            </td>
                            <td className="text-xs text-ink-600">{campo ? DESCRICAO[p.tipo][campo] : "Não entra na conciliação."}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {faltando(p.tipo, e).length > 0 && (
                  <Notice tone="danger" role="alert">
                    Falta indicar a coluna de {faltando(p.tipo, e).join(" e ")}. Sem isso não dá para conciliar.
                  </Notice>
                )}
                {p.tipo === "esperados" && !e.colunas.forma && (
                  <Notice tone="warning">Nenhuma coluna de forma de recebimento: sem ela, a taxa de cartão não é aplicada nesta conciliação.</Notice>
                )}
                <fieldset className="grid gap-1">
                  <legend className="label">Esta planilha está em: *</legend>
                  <div className="flex flex-wrap gap-4">
                    {MOEDAS.map((m) => (
                      <label key={m} className="flex min-h-10 items-center gap-2 text-sm text-ink-700">
                        <input type="radio" name={`${p.tipo}-moeda`} value={m} checked={e.moeda === m} onChange={() => mudar(p.tipo, (x) => ({ ...x, moeda: m }))} className="size-4 accent-brand-600" />
                        {ROTULO_MOEDA[m]}
                      </label>
                    ))}
                  </div>
                  <p className="hint">{p.moeda ? "Marcado pelos símbolos de moeda encontrados no arquivo; confira." : "Não encontramos símbolo de moeda no arquivo: escolha uma opção."}</p>
                </fieldset>
                {p.perguntas?.data && (
                  <fieldset className="grid gap-1 rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3">
                    <legend className="label px-1">Como estão escritas as datas? *</legend>
                    <p className="hint">Pela amostra não dá para saber o formato com certeza (por exemplo, se o dia vem antes ou depois do mês). Escolha o formato do arquivo.</p>
                    {p.perguntas.data.map((f) => (
                      <label key={f} className="flex min-h-10 items-center gap-2 text-sm text-ink-700">
                        <input type="radio" name={`${p.tipo}-pdata`} value={f} checked={e.formatoData === f} onChange={() => mudar(p.tipo, (x) => ({ ...x, formatoData: f }))} className="size-4 accent-brand-600" />
                        {ROTULO_DATA[f]}
                      </label>
                    ))}
                  </fieldset>
                )}
                {p.perguntas?.valor && (
                  <fieldset className="grid gap-1 rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3">
                    <legend className="label px-1">Como estão escritos os valores? *</legend>
                    <p className="hint">Os valores podem ser lidos de mais de um jeito, com resultados diferentes. Escolha o formato do arquivo.</p>
                    {p.perguntas.valor.map((f) => (
                      <label key={f} className="flex min-h-10 items-center gap-2 text-sm text-ink-700">
                        <input type="radio" name={`${p.tipo}-pvalor`} value={f} checked={e.formatoValor === f} onChange={() => mudar(p.tipo, (x) => ({ ...x, formatoValor: f }))} className="size-4 accent-brand-600" />
                        {ROTULO_VALOR[f]}
                      </label>
                    ))}
                  </fieldset>
                )}
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="label" htmlFor={`${p.tipo}-fdata`}>Formato da data</label>
                    <select id={`${p.tipo}-fdata`} className="input" value={e.formatoData} onChange={(ev) => mudar(p.tipo, (x) => ({ ...x, formatoData: ev.target.value }))}>
                      <option value="">Escolha</option>
                      {FORMATOS_DATA.map((f) => (
                        <option key={f} value={f}>{ROTULO_DATA[f]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`${p.tipo}-fvalor`}>Formato do valor</label>
                    <select id={`${p.tipo}-fvalor`} className="input" value={e.formatoValor} onChange={(ev) => mudar(p.tipo, (x) => ({ ...x, formatoValor: ev.target.value }))}>
                      <option value="">Escolha</option>
                      {FORMATOS_VALOR.map((f) => (
                        <option key={f} value={f}>{ROTULO_VALOR[f]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {p.erro && <Notice tone="warning" role="alert">{p.erro}</Notice>}
                {p.linhas.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <caption className="sr-only">Primeiras linhas convertidas de {p.arquivo}</caption>
                      <thead>
                        <tr><th className="num">Linha</th><th>Referência</th><th className="num">Valor</th><th>Data</th><th>Pagador</th><th>Situação</th></tr>
                      </thead>
                      <tbody>
                        {p.linhas.map((l) => (
                          <tr key={l.linha}>
                            <td className="num">{l.linha}</td>
                            <td>{l.referencia}</td>
                            <td className="num">{valorEm(l.valor, e.moeda)}</td>
                            <td>{l.data ? l.data.split("-").reverse().join("/") : ""}</td>
                            <td>{l.pagador}</td>
                            <td className={l.erro ? "text-red-700" : "text-ink-500"}>{l.erro ?? (l.ignorada ? `Ignorada (${l.ignorada})` : "OK")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {difere && (
            <div className="grid gap-3 rounded-xl border border-line bg-paper/50 px-4 py-3">
              <h3 className="font-semibold">Câmbio</h3>
              <p className="hint">
                Os esperados estão em {ROTULO_MOEDA[moedaEsp as Moeda]} e o extrato em {ROTULO_MOEDA[moedaExt as Moeda]}. A conciliação fica na moeda dos esperados, e o extrato é convertido pela cotação abaixo.
                {" "}Informe a cotação usada; o sistema não busca câmbio automaticamente.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="label" htmlFor="cotacao">Cotação (R$ por US$ 1) *</label>
                  <input className="input" id="cotacao" inputMode="decimal" placeholder="Ex.: 5,4321" value={cotacao} onChange={(ev) => setCotacao(ev.target.value)} maxLength={20} required />
                </div>
                <div>
                  <label className="label" htmlFor="toleranciaCambioPct">Tolerância de câmbio (%)</label>
                  <input className="input" id="toleranciaCambioPct" inputMode="decimal" value={toleranciaCambio} onChange={(ev) => setToleranciaCambio(ev.target.value)} maxLength={5} />
                  <p className="hint">Diferenças até esse percentual ganham a pista Diferença de câmbio. O item continua com valor diferente até alguém aceitar.</p>
                </div>
              </div>
            </div>
          )}
          {erro && <Notice tone="danger" role="alert">{erro}</Notice>}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
            {previas.length > 0 && (
              <form action={atualizar}>
                <SubmitButton variant="link" pending="Atualizando...">Atualizar prévia</SubmitButton>
              </form>
            )}
            <form action={confirmar}>
              <SubmitButton pending="Conciliando..." hint={previas.length ? "Salvando o layout e conciliando os arquivos." : "Conciliando os arquivos."} disabled={bloqueado}>
                {previas.length ? "Está certo, salvar layout" : "Conciliar"}
              </SubmitButton>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
