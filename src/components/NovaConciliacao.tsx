"use client";
// Formulário da nova conciliação com prévia das colunas. Os arquivos ficam só no navegador:
// na confirmação, o mesmo envio é refeito com o layout escolhido (o servidor não guarda o arquivo).
import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { FileSizeGuard } from "@/components/FileSizeGuard";
import { CardHeader, Notice } from "@/components/ui";
import type { PreviaArquivo, ResultadoPrevia, TipoLayout } from "@/lib/layout-conciliacao";

type Acao = (form: FormData) => Promise<ResultadoPrevia>;
type Escolha = { colunas: Record<string, string>; formatoData: string; formatoValor: string };

const FORMATOS_DATA = ["dd/mm/aaaa", "aaaa-mm-dd", "mm/dd/aaaa", "dd-mm-aaaa", "dd.mm.aaaa", "aaaammdd"];
const CAMPOS: Record<TipoLayout, { k: string; rotulo: string; obrigatorio?: boolean }[]> = {
  esperados: [
    { k: "referencia", rotulo: "Referência (nosso número)", obrigatorio: true },
    { k: "valor", rotulo: "Valor", obrigatorio: true },
    { k: "data", rotulo: "Vencimento" },
    { k: "pagador", rotulo: "Pagador" },
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
const TITULO: Record<TipoLayout, string> = { esperados: "1. O que você esperava receber", extrato: "2. O que caiu no banco" };
const LAYOUT_CAMPO: Record<TipoLayout, string> = { esperados: "layoutEsperados", extrato: "layoutExtrato" };

const escolhaDe = (p: PreviaArquivo): Escolha => ({
  colunas: Object.fromEntries(Object.entries(p.colunas).filter(([, v]) => v)) as Record<string, string>,
  formatoData: p.formatoData ?? "",
  formatoValor: p.formatoValor ?? "",
});

const brl = (n?: number) => (n === undefined ? "" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

export function NovaConciliacao({ preview, confirm }: { preview: Acao; confirm: Acao }) {
  const [envio, setEnvio] = useState<FormData | null>(null);
  const [previas, setPrevias] = useState<PreviaArquivo[]>([]);
  const [escolhas, setEscolhas] = useState<Partial<Record<TipoLayout, Escolha>>>({});
  const [erro, setErro] = useState<string | null>(null);

  const aplicar = (r: ResultadoPrevia, manter = false) => {
    if (!r) return;
    if (!r.ok) return setErro(r.erro);
    setErro(null);
    setPrevias(r.previas);
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
    return fd;
  };

  async function enviar(fd: FormData) {
    setEnvio(fd);
    setPrevias([]);
    aplicar(await preview(fd));
  }
  async function atualizar() {
    if (envio) aplicar(await preview(comLayouts(envio)), true);
  }
  async function confirmar() {
    if (envio) aplicar(await confirm(comLayouts(envio)), true);
  }

  const mudar = (tipo: TipoLayout, f: (e: Escolha) => Escolha) =>
    setEscolhas((s) => ({ ...s, [tipo]: f(s[tipo] ?? { colunas: {}, formatoData: "", formatoValor: "" }) }));

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

      {previas.length > 0 && (
        <section className="card grid gap-6" aria-labelledby="previa-titulo">
          <div>
            <h2 id="previa-titulo" className="text-lg font-semibold">Confira as colunas</h2>
            <p className="hint">
              É a primeira vez que este formato de planilha aparece. Indique o que é cada coluna e confira as primeiras linhas. Depois de confirmar, os próximos arquivos com as mesmas colunas são conciliados direto.
            </p>
          </div>
          {previas.map((p) => {
            const e = escolhas[p.tipo] ?? { colunas: {}, formatoData: "", formatoValor: "" };
            return (
              <div key={p.tipo} className="grid gap-3">
                <h3 className="font-semibold">
                  {TITULO[p.tipo]} <span className="font-normal text-ink-500">· {p.arquivo}</span>
                </h3>
                <p className="hint">
                  {p.origem === "ia" ? "Sugestão da IA, feita só com os nomes das colunas e uma amostra sem os dados reais." : p.origem === "heuristica" ? "Sugestão pelos nomes das colunas." : "Colunas escolhidas por você."}
                  {p.motivos.length ? ` ${p.motivos.join(". ")}.` : ""}
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                  {CAMPOS[p.tipo].map((c) => (
                    <div key={c.k}>
                      <label className="label" htmlFor={`${p.tipo}-${c.k}`}>{c.rotulo}{c.obrigatorio ? " *" : ""}</label>
                      <select
                        id={`${p.tipo}-${c.k}`}
                        className="input"
                        value={e.colunas[c.k] ?? ""}
                        onChange={(ev) =>
                          mudar(p.tipo, (x) => {
                            const colunas = { ...x.colunas };
                            if (ev.target.value) colunas[c.k] = ev.target.value;
                            else delete colunas[c.k];
                            return { ...x, colunas };
                          })
                        }
                      >
                        <option value="">{c.obrigatorio ? "Escolha a coluna" : "Não tem"}</option>
                        {p.cabecalho.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <div>
                    <label className="label" htmlFor={`${p.tipo}-fdata`}>Formato da data</label>
                    <select id={`${p.tipo}-fdata`} className="input" value={e.formatoData} onChange={(ev) => mudar(p.tipo, (x) => ({ ...x, formatoData: ev.target.value }))}>
                      <option value="">Escolha</option>
                      {FORMATOS_DATA.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`${p.tipo}-fvalor`}>Formato do valor</label>
                    <select id={`${p.tipo}-fvalor`} className="input" value={e.formatoValor} onChange={(ev) => mudar(p.tipo, (x) => ({ ...x, formatoValor: ev.target.value }))}>
                      <option value="">Escolha</option>
                      <option value="br">1.234,56 (vírgula decimal)</option>
                      <option value="ponto">1234.56 (ponto decimal)</option>
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
                            <td className="num">{brl(l.valor)}</td>
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
          {erro && <Notice tone="danger" role="alert">{erro}</Notice>}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
            <form action={atualizar}>
              <SubmitButton variant="link" pending="Atualizando...">Atualizar prévia</SubmitButton>
            </form>
            <form action={confirmar}>
              <SubmitButton pending="Conciliando..." hint="Salvando o layout e conciliando os arquivos.">Confirmar e conciliar</SubmitButton>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
