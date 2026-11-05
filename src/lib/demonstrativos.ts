// Consolidado Financeiro: linhas da DRE e do balanço, identidades contábeis e KPIs. Lógica pura (sem banco, sessão nem IA).
// Convenção de sinais: despesas, custos e deduções são positivos e subtraídos; resultado_financeiro tem sinal próprio.
// Valores sempre em reais (já multiplicados pela unidade do documento, ex.: "R$ mil" → × 1000).

export type TipoLinha = "fluxo" | "estoque";

export const LINHAS = [
  { chave: "receita_bruta", tipo: "fluxo", rotulo: "Receita bruta" },
  { chave: "deducoes", tipo: "fluxo", rotulo: "Deduções da receita" },
  { chave: "receita_liquida", tipo: "fluxo", rotulo: "Receita líquida" },
  { chave: "cmv", tipo: "fluxo", rotulo: "Custo das mercadorias vendidas (CMV)" },
  { chave: "lucro_bruto", tipo: "fluxo", rotulo: "Lucro bruto" },
  { chave: "despesas_operacionais", tipo: "fluxo", rotulo: "Despesas operacionais" },
  { chave: "ebitda", tipo: "fluxo", rotulo: "EBITDA" },
  { chave: "depreciacao", tipo: "fluxo", rotulo: "Depreciação e amortização" },
  { chave: "ebit", tipo: "fluxo", rotulo: "Resultado operacional (EBIT)" },
  { chave: "resultado_financeiro", tipo: "fluxo", rotulo: "Resultado financeiro" },
  { chave: "lair", tipo: "fluxo", rotulo: "Lucro antes do IR e CSLL (LAIR)" },
  { chave: "ir_csll", tipo: "fluxo", rotulo: "IR e CSLL" },
  { chave: "lucro_liquido", tipo: "fluxo", rotulo: "Lucro líquido" },
  { chave: "custos_variaveis", tipo: "fluxo", rotulo: "Custos variáveis", opcional: true },
  { chave: "custos_fixos", tipo: "fluxo", rotulo: "Custos fixos", opcional: true },
  { chave: "ativo_total", tipo: "estoque", rotulo: "Ativo total" },
  { chave: "passivo_circulante", tipo: "estoque", rotulo: "Passivo circulante" },
  { chave: "patrimonio_liquido", tipo: "estoque", rotulo: "Patrimônio líquido" },
  { chave: "emprestimos", tipo: "estoque", rotulo: "Empréstimos e financiamentos" },
  { chave: "caixa", tipo: "estoque", rotulo: "Caixa e equivalentes" },
] as const satisfies readonly { chave: string; tipo: TipoLinha; rotulo: string; opcional?: boolean }[];

export type ChaveLinha = (typeof LINHAS)[number]["chave"];
export type Linhas = Partial<Record<ChaveLinha, number>>;

export type StatusPeriodo = "RASCUNHO" | "CONFERIDO";
export type Periodo = { ano: number; mes: number; status: StatusPeriodo; linhas: Linhas };

const TIPO: Record<string, TipoLinha> = Object.fromEntries(LINHAS.map((l) => [l.chave, l.tipo]));

const num = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

// ---------- Identidades ----------

export type Identidade = {
  chave: string;
  descricao: string;
  status: "ok" | "divergente" | "sem_dados";
  esperado: number | null;
  encontrado: number | null;
  diferenca: number | null;
};

const IDENTIDADES: { chave: string; descricao: string; alvo: ChaveLinha; termos: [ChaveLinha, 1 | -1][] }[] = [
  { chave: "receita_liquida", descricao: "Receita líquida = receita bruta − deduções", alvo: "receita_liquida", termos: [["receita_bruta", 1], ["deducoes", -1]] },
  { chave: "lucro_bruto", descricao: "Lucro bruto = receita líquida − CMV", alvo: "lucro_bruto", termos: [["receita_liquida", 1], ["cmv", -1]] },
  // Parte da receita líquida (não do lucro bruto) para que um erro de digitação num subtotal gere um único alerta.
  { chave: "ebitda", descricao: "EBITDA = receita líquida − CMV − despesas operacionais", alvo: "ebitda", termos: [["receita_liquida", 1], ["cmv", -1], ["despesas_operacionais", -1]] },
  { chave: "ebit", descricao: "EBIT = EBITDA − depreciação", alvo: "ebit", termos: [["ebitda", 1], ["depreciacao", -1]] },
  { chave: "lair", descricao: "LAIR = EBIT + resultado financeiro", alvo: "lair", termos: [["ebit", 1], ["resultado_financeiro", 1]] },
  { chave: "lucro_liquido", descricao: "Lucro líquido = LAIR − IR e CSLL", alvo: "lucro_liquido", termos: [["lair", 1], ["ir_csll", -1]] },
];

/** As 6 identidades da DRE. Tolerância de R$ 1 × unidade do documento (ex.: R$ 1.000 em "R$ mil"). */
export function checarIdentidades(linhas: Linhas, unidade = 1): Identidade[] {
  const tol = Math.abs(unidade) * 1 + 1e-9;
  return IDENTIDADES.map((id) => {
    const enc = linhas[id.alvo];
    const vals = id.termos.map(([k]) => linhas[k]);
    if (!num(enc) || !vals.every(num)) return { chave: id.chave, descricao: id.descricao, status: "sem_dados", esperado: null, encontrado: num(enc) ? enc : null, diferenca: null };
    const esp = id.termos.reduce((s, [k, sinal]) => s + sinal * (linhas[k] as number), 0);
    const dif = enc - esp;
    return { chave: id.chave, descricao: id.descricao, status: Math.abs(dif) <= tol ? "ok" : "divergente", esperado: esp, encontrado: enc, diferenca: dif };
  });
}

// ---------- KPIs ----------

export type Motivo = "divisor_zero" | "pl_negativo" | "capital_negativo" | "sem_custo_variavel" | "linha_ausente" | "sem_periodos";
export type Aviso = "saldo_final" | "aliquota_padrao";
export type Kpi = { valor: number | null; motivo?: Motivo; avisos?: Aviso[] };

export const KPI_CHAVES = [
  "margem_bruta",
  "margem_ebitda",
  "margem_operacional",
  "margem_liquida",
  "roe",
  "roa",
  "roic",
  "roi",
  "ebitda",
  "ponto_equilibrio",
] as const;
export type KpiChave = (typeof KPI_CHAVES)[number];
export type Kpis = Record<KpiChave, Kpi>;

export type OpcoesKpi = {
  /** Fórmula do capital investido. Padrão: PL + empréstimos − caixa. */
  capitalInvestido?: "pl_emprestimos_menos_caixa" | "pl_emprestimos";
  /** Saldo médio ((início + fim)/2) nos índices de retorno. Padrão: true. Com false, usa o saldo final. */
  saldoMedio?: boolean;
  /** Alíquota usada no ROIC quando LAIR ≤ 0. Padrão: 0,34. */
  aliquotaPadrao?: number;
  /** Parte do CMV que é custo variável (0..1), quando a DRE não separa custos fixos e variáveis. */
  pctVariavelSobreCmv?: number;
};

const nulo = (motivo: Motivo): Kpi => ({ valor: null, motivo });

function razao(a: number | undefined, b: number | undefined, avisos?: Aviso[]): Kpi {
  if (!num(a) || !num(b)) return nulo("linha_ausente");
  if (b === 0) return nulo("divisor_zero");
  const v = a / b;
  if (!Number.isFinite(v)) return nulo("divisor_zero");
  return avisos?.length ? { valor: v, avisos } : { valor: v };
}

function capital(l: Linhas, o: OpcoesKpi): number | undefined {
  const pl = l.patrimonio_liquido, emp = l.emprestimos, cx = l.caixa;
  if (!num(pl) || !num(emp)) return undefined;
  if ((o.capitalInvestido ?? "pl_emprestimos_menos_caixa") === "pl_emprestimos") return pl + emp;
  return num(cx) ? pl + emp - cx : undefined;
}

/** Saldos de estoque a usar como divisor: média dos disponíveis, ou o final. `soFinal` indica que faltou o início. */
type Saldos = { pl?: number; ativo?: number; capital?: number; soFinal: boolean };

function media(xs: (number | undefined)[]): number | undefined {
  const v = xs.filter(num);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : undefined;
}

function calcular(f: Linhas, s: Saldos, o: OpcoesKpi): Kpis {
  const rl = f.receita_liquida;
  const avSaldo: Aviso[] = s.soFinal ? ["saldo_final"] : [];

  // ROE: PL ≤ 0 tem motivo próprio.
  let roe: Kpi;
  if (!num(f.lucro_liquido) || !num(s.pl)) roe = nulo("linha_ausente");
  else if (s.pl === 0) roe = nulo("divisor_zero");
  else if (s.pl < 0) roe = nulo("pl_negativo");
  else roe = razao(f.lucro_liquido, s.pl, avSaldo);

  // ROIC: NOPAT = EBIT × (1 − alíquota efetiva IR/LAIR); com LAIR ≤ 0, alíquota padrão sinalizada.
  let roic: Kpi;
  if (!num(f.ebit) || !num(s.capital) || !num(f.lair) || !num(f.ir_csll)) roic = nulo("linha_ausente");
  else if (s.capital === 0) roic = nulo("divisor_zero");
  else if (s.capital < 0) roic = nulo("capital_negativo");
  else {
    const padrao = f.lair <= 0;
    const aliq = padrao ? (o.aliquotaPadrao ?? 0.34) : f.ir_csll / f.lair;
    const av: Aviso[] = [...avSaldo, ...(padrao ? (["aliquota_padrao"] as Aviso[]) : [])];
    roic = razao(f.ebit * (1 - aliq), s.capital, av);
  }

  let roi: Kpi;
  if (!num(f.lucro_liquido) || !num(s.capital)) roi = nulo("linha_ausente");
  else if (s.capital === 0) roi = nulo("divisor_zero");
  else if (s.capital < 0) roi = nulo("capital_negativo");
  else roi = razao(f.lucro_liquido, s.capital, avSaldo);

  return {
    margem_bruta: razao(f.lucro_bruto, rl),
    margem_ebitda: razao(f.ebitda, rl),
    margem_operacional: razao(f.ebit, rl),
    margem_liquida: razao(f.lucro_liquido, rl),
    roe,
    roa: razao(f.lucro_liquido, s.ativo, avSaldo),
    roic,
    roi,
    ebitda: num(f.ebitda) ? { valor: f.ebitda } : nulo("linha_ausente"),
    ponto_equilibrio: pontoEquilibrio(f, o),
  };
}

/**
 * Ponto de equilíbrio contábil = custos fixos / (margem de contribuição / receita líquida).
 * 1) Usa custos_variaveis e custos_fixos da DRE, se houver.
 * 2) Senão, com pctVariavelSobreCmv: variáveis = CMV × pct; fixos = CMV × (1 − pct) + despesas operacionais + depreciação.
 * 3) Senão, null com "sem_custo_variavel".
 */
export function pontoEquilibrio(f: Linhas, o: OpcoesKpi = {}): Kpi {
  const rl = f.receita_liquida;
  let variaveis: number | undefined, fixos: number | undefined;
  if (num(f.custos_variaveis) && num(f.custos_fixos)) {
    variaveis = f.custos_variaveis;
    fixos = f.custos_fixos;
  } else if (num(o.pctVariavelSobreCmv)) {
    const p = Math.min(1, Math.max(0, o.pctVariavelSobreCmv));
    if (!num(f.cmv) || !num(f.despesas_operacionais)) return nulo("linha_ausente");
    variaveis = f.cmv * p;
    fixos = f.cmv * (1 - p) + f.despesas_operacionais + (f.depreciacao ?? 0);
  } else return nulo("sem_custo_variavel");
  if (!num(rl)) return nulo("linha_ausente");
  if (rl === 0) return nulo("divisor_zero");
  const pctMc = (rl - variaveis) / rl;
  if (pctMc === 0) return nulo("divisor_zero");
  return razao(fixos, pctMc);
}

/** KPIs de um mês. Com `anterior` (mês anterior), usa saldo médio; sem ele, usa o saldo final e marca "saldo_final". */
export function kpis(periodo: Periodo | Linhas, anterior?: Periodo | Linhas, opcoes: OpcoesKpi = {}): Kpis {
  const f = "linhas" in periodo ? (periodo as Periodo).linhas : (periodo as Linhas);
  const a = anterior ? ("linhas" in anterior ? (anterior as Periodo).linhas : (anterior as Linhas)) : undefined;
  const usarMedia = opcoes.saldoMedio ?? true;
  const temInicio = !!a && usarMedia;
  const par = (k: (l: Linhas) => number | undefined) => (temInicio ? media([k(a!), k(f)]) : k(f));
  // Só sinaliza se a média foi pedida mas faltou o início.
  const s: Saldos = {
    pl: par((l) => l.patrimonio_liquido),
    ativo: par((l) => l.ativo_total),
    capital: par((l) => capital(l, opcoes)),
    soFinal: usarMedia && !a,
  };
  return calcular(f, s, opcoes);
}

/** Soma os fluxos e pega o saldo final (último mês) dos estoques. Só considera períodos CONFERIDO. */
export function consolidar(periodos: Periodo[]): Linhas {
  const ok = periodos.filter((p) => p.status === "CONFERIDO").sort((x, y) => x.ano - y.ano || x.mes - y.mes);
  const out: Linhas = {};
  for (const { chave } of LINHAS) {
    if (TIPO[chave] === "fluxo") {
      const v = ok.map((p) => p.linhas[chave]).filter(num);
      if (v.length) out[chave] = v.reduce((s, x) => s + x, 0);
    } else {
      for (let i = ok.length - 1; i >= 0; i--) {
        const v = ok[i].linhas[chave];
        if (num(v)) {
          out[chave] = v;
          break;
        }
      }
    }
  }
  return out;
}

export type KpisTrimestre = { kpis: Kpis; meses: number; parcial: boolean; situacao: string; linhas: Linhas };

/** KPIs de um trimestre: fluxos somados; índices de retorno usam a média dos saldos finais disponíveis. */
export function kpisTrimestre(periodos: Periodo[], opcoes: OpcoesKpi = {}): KpisTrimestre {
  const ok = periodos.filter((p) => p.status === "CONFERIDO");
  const meses = ok.length;
  const situacao = meses >= 3 ? "completo" : `parcial (${meses}/3)`;
  const linhas = consolidar(ok);
  if (!meses) {
    const vazio = Object.fromEntries(KPI_CHAVES.map((k) => [k, nulo("sem_periodos")])) as Kpis;
    return { kpis: vazio, meses, parcial: true, situacao, linhas };
  }
  const usarMedia = opcoes.saldoMedio ?? true;
  const pega = (k: (l: Linhas) => number | undefined) => (usarMedia ? media(ok.map((p) => k(p.linhas))) : k(linhas));
  const s: Saldos = {
    pl: pega((l) => l.patrimonio_liquido),
    ativo: pega((l) => l.ativo_total),
    capital: pega((l) => capital(l, opcoes)),
    soFinal: false,
  };
  return { kpis: calcular(linhas, s, opcoes), meses, parcial: meses < 3, situacao, linhas };
}

// ---------- Fórmulas explicadas ----------

export type Formula = { chave: KpiChave; nome: string; formula: string; explicacao: string };

export const FORMULAS: Record<"pt" | "en", Formula[]> = {
  pt: [
    { chave: "margem_bruta", nome: "Margem bruta", formula: "Lucro bruto ÷ Receita líquida", explicacao: "Quanto sobra de cada R$ 1 vendido depois de pagar o custo do que foi vendido." },
    { chave: "margem_ebitda", nome: "Margem EBITDA", formula: "EBITDA ÷ Receita líquida", explicacao: "Quanto a operação gera de caixa para cada R$ 1 vendido, antes de juros, impostos sobre o lucro e depreciação." },
    { chave: "margem_operacional", nome: "Margem operacional", formula: "EBIT ÷ Receita líquida", explicacao: "Quanto sobra de cada R$ 1 vendido depois de todos os custos e despesas da operação." },
    { chave: "margem_liquida", nome: "Margem líquida", formula: "Lucro líquido ÷ Receita líquida", explicacao: "Quanto vira lucro de fato para cada R$ 1 vendido, depois de tudo." },
    { chave: "roe", nome: "ROE (retorno sobre o patrimônio)", formula: "Lucro líquido ÷ Patrimônio líquido médio", explicacao: "Quanto o dinheiro dos sócios rendeu no período. Não é anualizado." },
    { chave: "roa", nome: "ROA (retorno sobre o ativo)", formula: "Lucro líquido ÷ Ativo total médio", explicacao: "Quanto lucro a empresa tirou de tudo o que possui." },
    { chave: "roic", nome: "ROIC (retorno sobre o capital investido)", formula: "EBIT × (1 − alíquota de IR) ÷ Capital investido médio", explicacao: "Quanto a operação rende sobre o dinheiro colocado por sócios e bancos, já descontado o imposto." },
    { chave: "roi", nome: "ROI (retorno sobre o investimento)", formula: "Lucro líquido ÷ (Patrimônio líquido + Empréstimos − Caixa)", explicacao: "Quanto o lucro representa do dinheiro efetivamente investido no negócio." },
    { chave: "ebitda", nome: "EBITDA", formula: "Receita líquida − CMV − Despesas operacionais", explicacao: "O resultado da operação antes de juros, impostos sobre o lucro e depreciação." },
    { chave: "ponto_equilibrio", nome: "Ponto de equilíbrio contábil", formula: "Custos fixos ÷ (Margem de contribuição ÷ Receita líquida)", explicacao: "Quanto a empresa precisa vender para não ter lucro nem prejuízo." },
  ],
  en: [
    { chave: "margem_bruta", nome: "Gross margin", formula: "Gross profit ÷ Net revenue", explicacao: "How much is left from each $1 sold after paying the cost of what was sold." },
    { chave: "margem_ebitda", nome: "EBITDA margin", formula: "EBITDA ÷ Net revenue", explicacao: "How much cash the operation generates per $1 sold, before interest, income taxes and depreciation." },
    { chave: "margem_operacional", nome: "Operating margin", formula: "EBIT ÷ Net revenue", explicacao: "How much is left from each $1 sold after all operating costs and expenses." },
    { chave: "margem_liquida", nome: "Net margin", formula: "Net income ÷ Net revenue", explicacao: "How much actually becomes profit for each $1 sold, after everything." },
    { chave: "roe", nome: "ROE (return on equity)", formula: "Net income ÷ Average equity", explicacao: "How much the owners' money earned in the period. Not annualized." },
    { chave: "roa", nome: "ROA (return on assets)", formula: "Net income ÷ Average total assets", explicacao: "How much profit the company made from everything it owns." },
    { chave: "roic", nome: "ROIC (return on invested capital)", formula: "EBIT × (1 − tax rate) ÷ Average invested capital", explicacao: "How much the operation earns on money put in by owners and lenders, after tax." },
    { chave: "roi", nome: "ROI (return on investment)", formula: "Net income ÷ (Equity + Loans − Cash)", explicacao: "How much the profit represents of the money actually invested in the business." },
    { chave: "ebitda", nome: "EBITDA", formula: "Net revenue − COGS − Operating expenses", explicacao: "The operating result before interest, income taxes and depreciation." },
    { chave: "ponto_equilibrio", nome: "Break-even point", formula: "Fixed costs ÷ (Contribution margin ÷ Net revenue)", explicacao: "How much the company needs to sell to make neither profit nor loss." },
  ],
};
