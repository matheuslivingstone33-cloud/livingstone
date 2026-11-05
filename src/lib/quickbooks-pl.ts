// Leitor do "Profit & Loss" do QuickBooks a partir do texto já extraído do PDF (uma string por página).
// Lógica pura e determinística: não lê PDF (isso fica com src/lib/pdf.ts) e nunca usa a data atual.
import { caminhoDe, checarContas, normalizar, type ArvoreContas, type Conta, type Divergencia, type Resumo, type Secao } from "./plano-contas";

export type ErroQuickbooks = "layout_desconhecido" | "periodo_nao_mensal" | "sem_periodo";
export type PlQuickbooks = ArvoreContas & { empresa: string; ano: number; mes: number };
export type ResultadoQuickbooks = PlQuickbooks | { erro: ErroQuickbooks; divergencias?: Divergencia[] };

const MESES: [RegExp, number][] = [
  [/^jan(uary)?$/, 1], [/^feb(ruary)?$/, 2], [/^mar(ch)?$/, 3], [/^apr(il)?$/, 4], [/^may$/, 5], [/^june?$/, 6],
  [/^july?$/, 7], [/^aug(ust)?$/, 8], [/^sep(t|tember)?$/, 9], [/^oct(ober)?$/, 10], [/^nov(ember)?$/, 11], [/^dec(ember)?$/, 12],
];
const MES_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?(?:\s+\d{1,2}(?:\s*-\s*\d{1,2})?,)?(?:\s+('\d{2}|\d{4}|\d{2})\b)?/gi;
const numMes = (t: string) => MESES.find(([re]) => re.test(t.toLowerCase()))![1];

const HORA = /^\d{1,2}:\d{2}\s*(am|pm)?\s*/i;
const DATA = /^\d{1,2}\/\d{1,2}\/\d{2,4}\s*/;
const BASE = /^(accrual|cash) basis\s*/i;
const PL = /profit\s*(&|and)\s*loss/i;
const PAGINA = /^page \d+( of \d+)?$/i;
/** Rodapé "Page N of M" grudado no fim da última linha da página (a extração junta os textos). */
const RODAPE = /\s*page \d+ of \d+\s*$/i;
/** Linha que é só período/coluna: "September 2026", "Sep 26", "Sep '26", "TOTAL". */
const SO_PERIODO = /^(((jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+('?\d{2}|\d{4})\s*)+|total)$/i;
const VALOR = /^(?:(.*[^\s$(\-])\s+)?(-?\s?\$?\s?\(?\s?-?\s?\$?\s?\d+(?:,\d{3})*\.\d{2}\s?\)?)$/;
const SO_NUMERO = /^[-$()\s\d.,]+$/;

/** Tira hora, data e "Accrual/Cash Basis" do começo da linha (o QuickBooks os imprime à esquerda do cabeçalho) e o rodapé do fim. */
const limparCabecalho = (l: string) => l.replace(HORA, "").replace(DATA, "").replace(BASE, "").replace(RODAPE, "").trim();

function valorDe(s: string): number {
  const v = Number(s.replace(/[^\d.]/g, ""));
  return /[-(]/.test(s) ? -v : v;
}

const linhasDe = (t: string) => t.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

function secaoDe(l: string): Secao | null {
  const n = normalizar(l);
  if (n === "income") return "income";
  if (n === "cost of goods sold" || n === "cogs") return "cogs";
  if (n === "expense" || n === "expenses") return "expense";
  if (n === "other income") return "other_income";
  if (n === "other expense" || n === "other expenses") return "other_expense";
  return null;
}
const ENVOLTORIO = /^(ordinary|other) income\/expense$/;
const RESUMO: [RegExp, keyof Resumo][] = [
  [/^gross profit$/, "gross_profit"],
  [/^net (ordinary|operating) income$/, "net_ordinary"],
  [/^net other income$/, "net_other"],
  [/^net income$/, "net_income"],
];

/** Início do corpo: primeira seção, envoltório ou linha com valor. */
const ehCorpo = (l: string) => !!secaoDe(l) || ENVOLTORIO.test(normalizar(l)) || (VALOR.test(l) && !SO_PERIODO.test(l));

/**
 * Mês do relatório pelo cabeçalho (linhas depois de "Profit & Loss", até o corpo): "September 2026", "Sep 2026",
 * "Sep 26", "Sep '26". Intervalo ("January - September 2026") ou várias colunas → "periodo_nao_mensal".
 */
export function detectarMes(texto: string): { ano: number; mes: number } | { erro: "periodo_nao_mensal" | "sem_periodo" } {
  const ls = linhasDe(texto);
  const i = ls.findIndex((l) => PL.test(l));
  const cab: string[] = [];
  for (let j = i < 0 ? 0 : i; j < ls.length && cab.length < 8; j++) {
    const l = limparCabecalho(ls[j]).replace(PL, "").trim();
    if (j > i && ehCorpo(l)) break;
    if (l) cab.push(l);
  }
  const meses = new Set<number>(), anos = new Set<number>();
  for (const l of cab)
    for (const m of l.matchAll(MES_RE)) {
      meses.add(numMes(m[1]));
      if (m[2]) {
        const y = m[2].replace("'", "");
        anos.add(y.length === 2 ? 2000 + Number(y) : Number(y));
      }
    }
  if (meses.size > 1 || anos.size > 1) return { erro: "periodo_nao_mensal" };
  if (!meses.size || !anos.size) return { erro: "sem_periodo" };
  return { ano: [...anos][0], mes: [...meses][0] };
}

/**
 * Lê o P&L mensal do QuickBooks. Hierarquia por cabeçalho de grupo + "Total X" (grupos podem atravessar páginas);
 * ignora cabeçalho/rodapé de página. Só tenta com "Profit & Loss"/"Profit and Loss" e "Net Income" no texto.
 * Mais de 20% de linhas só com número, linha fora de seção, "Total" sem grupo ou totais que não batem → "layout_desconhecido".
 */
export function parseQuickbooksPL(paginas: string[]): ResultadoQuickbooks {
  const texto = paginas.join("\n");
  if (!PL.test(texto) || !/net income/i.test(texto)) return { erro: "layout_desconhecido" };
  const periodo = detectarMes(texto);
  if ("erro" in periodo) return { erro: periodo.erro };

  const ls = linhasDe(texto);
  const iPl = ls.findIndex((l) => PL.test(l));
  const empresa = iPl > 0 ? limparCabecalho(ls[iPl - 1]) : "";
  const ruido = (l: string) => !l || l === empresa || PL.test(l) || PAGINA.test(l) || SO_PERIODO.test(l);

  const contas: Conta[] = [];
  const porCaminho = new Map<string, Conta>();
  const secoes: ArvoreContas["secoes"] = {};
  const resumo: Resumo = {};
  let secao: Secao | null = null;
  let pilha: Conta[] = [];
  let corpo = 0, soNumero = 0, falhou = false;
  const moeda = /R\$/.test(texto) ? "BRL" : "USD";

  const nova = (nome: string, valor: number): Conta => {
    const pai = pilha.at(-1) ?? null;
    const caminho = caminhoDe(secao!, [...pilha.map((p) => p.nome), nome]);
    const c: Conta = { caminho, nome, secao: secao!, pai: pai?.caminho ?? null, nivel: pilha.length, valor, filhas: [] };
    if (porCaminho.has(caminho)) falhou = true;
    porCaminho.set(caminho, c);
    contas.push(c);
    pai?.filhas.push(caminho);
    return c;
  };

  // Todas as linhas: no texto extraído o cabeçalho pode vir no fim da página (como no PDF real do QuickBooks)
  for (const bruta of ls) {
    const l = limparCabecalho(bruta);
    if (ruido(l)) continue;
    corpo++;
    if (SO_NUMERO.test(l)) {
      soNumero++;
      continue;
    }
    const s = secaoDe(l);
    if (s) {
      secao = s;
      pilha = [];
      continue;
    }
    if (ENVOLTORIO.test(normalizar(l))) continue;
    const m = VALOR.exec(l);
    if (!m) {
      if (!secao) falhou = true;
      else pilha.push(nova(l, 0));
      continue;
    }
    const rotulo = m[1], v = valorDe(m[2]);
    const n = normalizar(rotulo);
    const res = RESUMO.find(([re]) => re.test(n));
    if (res) {
      resumo[res[1]] = v;
      if (res[1] !== "net_other") secao = null;
      pilha = [];
      continue;
    }
    const tot = /^total (.+)$/i.exec(rotulo);
    if (tot) {
      const st = secaoDe(tot[1]);
      if (st) {
        secoes[st] = v;
        pilha = [];
        continue;
      }
      const alvo = normalizar(tot[1]);
      const k = pilha.map((p) => normalizar(p.nome)).lastIndexOf(alvo);
      if (k < 0) falhou = true;
      else {
        pilha[k].total = v;
        pilha = pilha.slice(0, k);
      }
      continue;
    }
    if (!secao) falhou = true;
    else nova(rotulo, v);
  }

  if (falhou || !corpo || soNumero / corpo > 0.2 || resumo.net_income === undefined) return { erro: "layout_desconhecido" };
  const arvore: ArvoreContas = { moeda, contas, secoes, resumo };
  const chk = checarContas(arvore);
  if (!chk.ok) return { erro: "layout_desconhecido", divergencias: chk.divergencias };
  return { ...arvore, empresa, ano: periodo.ano, mes: periodo.mes };
}
