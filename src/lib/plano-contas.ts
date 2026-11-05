// Consolidado Financeiro: árvore de contas (ex.: P&L do QuickBooks), conferência de totais, mapeamento para as linhas
// da DRE e classificação fixo/variável. Lógica pura: importa só demonstrativos e moeda. Valores na moeda do período.
import type { ChaveLinha, Linhas } from "./demonstrativos";
import type { Moeda } from "./moeda";

export type Secao = "income" | "cogs" | "expense" | "other_income" | "other_expense";
export const SECOES: readonly Secao[] = ["income", "cogs", "expense", "other_income", "other_expense"];

/**
 * Conta da árvore. `caminho` (seção + nomes normalizados, " > ") é a chave estável usada no mapa de classes da org.
 * `valor`: lançamento da própria linha (0 num cabeçalho de grupo). `total`: linha "Total X" do grupo, se houver.
 */
export type Conta = { caminho: string; nome: string; secao: Secao; pai: string | null; nivel: number; valor: number; total?: number; filhas: string[] };

export type Resumo = { gross_profit?: number; net_ordinary?: number; net_other?: number; net_income?: number };
export type ArvoreContas = { moeda: Moeda; contas: Conta[]; secoes: Partial<Record<Secao, number>>; resumo: Resumo };

export type Classe = "variavel" | "fixo" | "fora" | "nao_classificada";
export type Flag = "distribuicao" | "suspensa";

/** Minúsculas, sem acentos, espaços colapsados. */
export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const caminhoDe = (secao: Secao, nomes: string[]) => [secao, ...nomes.map(normalizar)].join(" > ");

const TOL = 0.01 + 1e-9;
const c2 = (n: number) => Math.round(n * 100) / 100;

/** Valor efetivo: o "Total X" do grupo, ou o valor da própria linha. */
export const efetivo = (c: Conta) => c.total ?? c.valor;

function porCaminho(a: ArvoreContas) {
  return new Map(a.contas.map((c) => [c.caminho, c]));
}

/** Soma das contas de primeiro nível da seção (sem pai). */
function somaSecao(a: ArvoreContas, s: Secao) {
  return c2(a.contas.filter((c) => c.secao === s && c.pai === null).reduce((t, c) => t + efetivo(c), 0));
}

/** Total da seção: o impresso, ou a soma das contas (0 se a seção não existe). */
export const totalSecao = (a: ArvoreContas, s: Secao) => a.secoes[s] ?? somaSecao(a, s);

export type Divergencia = { chave: string; esperado: number; encontrado: number; diferenca: number };

/**
 * Confere a árvore (tolerância de 0,01): soma das filhas = Total de cada grupo e de cada seção;
 * Gross = Income − COGS; Net Ordinary = Gross − Expense; Net Other = Other Income − Other Expense;
 * Net Income = Net Ordinary + Net Other. Linhas de resumo ausentes não são conferidas.
 */
export function checarContas(a: ArvoreContas): { ok: boolean; divergencias: Divergencia[] } {
  const div: Divergencia[] = [];
  const conf = (chave: string, esperado: number, encontrado: number | undefined) => {
    if (encontrado === undefined) return;
    const d = c2(encontrado - esperado);
    if (Math.abs(encontrado - esperado) > TOL) div.push({ chave, esperado: c2(esperado), encontrado, diferenca: d });
  };
  const mapa = porCaminho(a);
  for (const c of a.contas) {
    if (!c.filhas.length) continue;
    const soma = c.filhas.reduce((t, k) => t + efetivo(mapa.get(k)!), c.valor);
    conf(c.caminho, soma, c.total);
  }
  for (const s of SECOES) conf(s, somaSecao(a, s), a.secoes[s]);
  const T = (s: Secao) => totalSecao(a, s);
  const r = a.resumo;
  const gross = r.gross_profit ?? T("income") - T("cogs");
  const ord = r.net_ordinary ?? gross - T("expense");
  const other = r.net_other ?? T("other_income") - T("other_expense");
  conf("gross_profit", T("income") - T("cogs"), r.gross_profit);
  conf("net_ordinary", gross - T("expense"), r.net_ordinary);
  conf("net_other", T("other_income") - T("other_expense"), r.net_other);
  conf("net_income", ord + other, r.net_income);
  return { ok: div.length === 0, divergencias: div };
}

// ---------- Atenção por nome ----------

export function flagDe(nome: string): Flag | null {
  const n = normalizar(nome);
  if (/shareholder distributions?|owner'?s? distributions?/.test(n)) return "distribuicao";
  if (/ask my accountant/.test(n)) return "suspensa";
  return null;
}

/** Contas sinalizadas por nome (distribuição aos sócios lançada como despesa; conta de espera "Ask My Accountant"). */
export const atencao = (a: ArvoreContas) =>
  a.contas.flatMap((c) => {
    const flag = flagDe(c.nome);
    return flag ? [{ caminho: c.caminho, flag, valor: efetivo(c) }] : [];
  });

/** Soma das distribuições aos sócios lançadas como despesa (para o lucro líquido ajustado). */
export const distribuicoes = (a: ArvoreContas) => c2(atencao(a).filter((x) => x.flag === "distribuicao").reduce((t, x) => t + x.valor, 0));

// ---------- Mapeamento para a DRE ----------

export type Alerta = { codigo: "sem_balanco" | "linha_inferida" | Flag; caminho?: string; linha?: ChaveLinha; valor?: number };

/**
 * P&L do QuickBooks → linhas da DRE:
 * receita_bruta = receita_liquida = Total Income · cmv = Total COGS · lucro_bruto = Gross Profit ·
 * despesas_operacionais = Total Expense · ebitda = ebit = Net Ordinary Income · outras_despesas = −Net Other Income ·
 * lair = lucro_liquido = Net Income. Deduções, depreciação, resultado financeiro e IR não existem no relatório:
 * viram 0 e entram em `inferidas`. Não há balanço (alerta "sem_balanco").
 */
export function mapearQuickbooks(a: ArvoreContas): { linhas: Linhas; inferidas: ChaveLinha[]; alertas: Alerta[] } {
  const T = (s: Secao) => totalSecao(a, s);
  const r = a.resumo;
  const gross = c2(r.gross_profit ?? T("income") - T("cogs"));
  const ord = c2(r.net_ordinary ?? gross - T("expense"));
  const other = c2(r.net_other ?? T("other_income") - T("other_expense"));
  const ni = c2(r.net_income ?? ord + other);
  const inferidas: ChaveLinha[] = ["deducoes", "depreciacao", "resultado_financeiro", "ir_csll"];
  const linhas: Linhas = {
    receita_bruta: T("income"),
    deducoes: 0,
    receita_liquida: T("income"),
    cmv: T("cogs"),
    lucro_bruto: gross,
    despesas_operacionais: T("expense"),
    ebitda: ord,
    depreciacao: 0,
    ebit: ord,
    resultado_financeiro: 0,
    outras_despesas: c2(-other),
    lair: ni,
    ir_csll: 0,
    lucro_liquido: ni,
  };
  const alertas: Alerta[] = [
    { codigo: "sem_balanco" },
    ...inferidas.map((linha): Alerta => ({ codigo: "linha_inferida", linha })),
    ...atencao(a).map((x): Alerta => ({ codigo: x.flag, caminho: x.caminho, valor: x.valor })),
  ];
  return { linhas, inferidas, alertas };
}

// ---------- Classificação fixo / variável ----------

/** Padrão: COGS → variável; Payroll Expenses (e filhas) → fixo; Other Income/Expense → fora; demais ficam sem classe. */
export function padroesQuickbooks(a: ArvoreContas): Record<string, Classe> {
  const out: Record<string, Classe> = {};
  for (const c of a.contas) {
    if (c.pai !== null) continue;
    if (c.secao === "cogs") out[c.caminho] = "variavel";
    else if (c.secao === "other_income" || c.secao === "other_expense") out[c.caminho] = "fora";
    else if (c.secao === "expense" && /^payroll( expenses?)?$/.test(normalizar(c.nome))) out[c.caminho] = "fixo";
  }
  return out;
}

export type Classificacao = {
  classes: Record<string, Classe>;
  custos_variaveis: number;
  custos_fixos: number;
  /** Contas sem classe, no nível mais alto (classificar a mãe resolve as filhas). */
  pendentes: string[];
};

/**
 * Classe de cada conta: mapa da org > padrão do QuickBooks > classe da mãe (propaga para as filhas) > "nao_classificada".
 * Income não entra (é receita). Custos somam as linhas próprias de cada conta de COGS/Expense, na moeda do período.
 */
export function classificar(a: ArvoreContas, mapaOrg: Record<string, Classe> = {}): Classificacao {
  const base: Record<string, Classe> = { ...padroesQuickbooks(a), ...mapaOrg };
  const mapa = porCaminho(a);
  const classes: Record<string, Classe> = {};
  const resolver = (c: Conta): Classe => {
    if (classes[c.caminho]) return classes[c.caminho];
    const propria = base[c.caminho];
    const v: Classe = propria && propria !== "nao_classificada" ? propria : c.pai ? resolver(mapa.get(c.pai)!) : "nao_classificada";
    return (classes[c.caminho] = v);
  };
  let variaveis = 0, fixos = 0;
  const pendentes: string[] = [];
  for (const c of a.contas) {
    if (c.secao === "income") continue;
    const k = resolver(c);
    if (k === "variavel") variaveis += c.valor;
    if (k === "fixo") fixos += c.valor;
    if (k === "nao_classificada" && (!c.pai || classes[c.pai] !== "nao_classificada")) pendentes.push(c.caminho);
  }
  return { classes, custos_variaveis: c2(variaveis), custos_fixos: c2(fixos), pendentes };
}

/** Linhas com custos fixos/variáveis quando a classificação está completa; com pendentes, devolve as linhas sem eles. */
export function aplicarClassificacao(linhas: Linhas, cl: Classificacao): Linhas {
  if (cl.pendentes.length) return linhas;
  return { ...linhas, custos_variaveis: cl.custos_variaveis, custos_fixos: cl.custos_fixos };
}
