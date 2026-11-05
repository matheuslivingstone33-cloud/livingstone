// Consolidado Financeiro: regras da tela (mensagens, validação de classe, moeda do ano, conferência e montagem dos
// períodos com a classificação da org). Lógica pura: sem banco, sessão, Next nem IA.
import { checarIdentidades, kpis, kpisOpcionais, kpisTrimestre, type Kpi, type Kpis, type Linhas, type Motivo, type Periodo, type StatusPeriodo } from "./demonstrativos";
import { SECOES, aplicarClassificacao, classificar, distribuicoes, totalSecao, type Alerta, type ArvoreContas, type Classe, type Conta, type Secao } from "./plano-contas";
import { parseQuickbooksPL, type PlQuickbooks, type ResultadoQuickbooks } from "./quickbooks-pl";
import { isMoeda, type Moeda } from "./moeda";

// ---------- Textos ----------

export const T = {
  pt: {
    motivo: {
      divisor_zero: "divisão por zero (a base do cálculo está zerada)",
      pl_negativo: "patrimônio líquido negativo",
      capital_negativo: "capital investido negativo",
      sem_custo_variavel: "classifique as contas em fixo e variável",
      linha_ausente: "falta uma linha no relatório",
      sem_periodos: "nenhum mês conferido",
      contas_nao_classificadas: "classifique as contas pendentes",
      sem_balanco: "sem balanço: envie o Balance Sheet",
      margem_contribuicao_negativa: "custos variáveis maiores que a receita",
    } satisfies Record<Motivo, string>,
    classe: { fixo: "Fixo", variavel: "Variável", fora: "Fora do cálculo", nao_classificada: "Não classificada" } satisfies Record<Classe, string>,
    atencao: {
      suspensa: "Ask My Accountant: aguardando contador",
      distribuicao: "Shareholder Distributions: retirada dos sócios",
    },
  },
  en: {
    motivo: {
      divisor_zero: "division by zero (the base is zero)",
      pl_negativo: "negative equity",
      capital_negativo: "negative invested capital",
      sem_custo_variavel: "classify the accounts as fixed or variable",
      linha_ausente: "a line is missing in the report",
      sem_periodos: "no reviewed month",
      contas_nao_classificadas: "classify the pending accounts",
      sem_balanco: "no balance sheet: upload the Balance Sheet",
      margem_contribuicao_negativa: "variable costs exceed revenue",
    } satisfies Record<Motivo, string>,
    classe: { fixo: "Fixed", variavel: "Variable", fora: "Excluded", nao_classificada: "Unclassified" } satisfies Record<Classe, string>,
    atencao: {
      suspensa: "Ask My Accountant: waiting for the accountant",
      distribuicao: "Shareholder Distributions: owners' withdrawals",
    },
  },
} as const;

/** Motivo amigável de um KPI sem valor; "" quando há valor. */
export function motivoAmigavel(k: Kpi | undefined, idioma: "pt" | "en" = "pt"): string {
  if (!k || k.valor !== null) return "";
  return k.motivo ? T[idioma].motivo[k.motivo] : T[idioma].motivo.linha_ausente;
}

// ---------- Classes ----------

export const CLASSES: readonly Classe[] = ["fixo", "variavel", "fora", "nao_classificada"];
export const isClasse = (v: unknown): v is Classe => typeof v === "string" && (CLASSES as readonly string[]).includes(v);

// ---------- Importação ----------

export const fmtNum = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Mensagem para quem enviou o PDF quando o parser recusa. Lista no máximo 3 divergências. */
export function mensagemErroImportacao(r: Extract<ResultadoQuickbooks, { erro: string }>): string {
  if (r.erro === "periodo_nao_mensal") return "O relatório cobre mais de um mês. No QuickBooks, gere o Profit & Loss de um único mês e envie de novo.";
  if (r.erro === "sem_periodo") return "Não encontrei o mês no cabeçalho do relatório. Envie o Profit & Loss do QuickBooks de um único mês, com o período no topo.";
  const base = "Formato não reconhecido: envie o relatório Profit & Loss do QuickBooks de um único mês";
  if (!r.divergencias?.length) return base;
  const lista = r.divergencias.slice(0, 3).map((d) => `${d.chave} (soma ${fmtNum(d.esperado)}, total impresso ${fmtNum(d.encontrado)})`);
  return `${base}. Os totais não batem em: ${lista.join("; ")}.`;
}

/** Mês já conferido: o relatório não pode ser reenviado sem reabrir. */
export const mensagemMesConferido = (ano: number, mes: number) => `${String(mes).padStart(2, "0")}/${ano} já está conferido. Reabra o mês antes de enviar o relatório de novo.`;

// ---------- P&L anexado no assistente ----------

const PL_RE = /profit\s*(&|and)\s*loss/i;

/**
 * O PDF anexado é um P&L do QuickBooks? nao_qb = não parece (segue o fluxo normal do assistente);
 * erro = parece, mas não dá para lançar (mensagem amigável); ok = árvore pronta para lançar.
 */
export function ehPLQuickbooks(paginas: string[]): { tipo: "nao_qb" } | { tipo: "erro"; mensagem: string } | { tipo: "ok"; pl: PlQuickbooks } {
  const texto = paginas.join("\n");
  if (!PL_RE.test(texto) || !/net income/i.test(texto)) return { tipo: "nao_qb" };
  const r = parseQuickbooksPL(paginas);
  if ("erro" in r) return { tipo: "erro", mensagem: mensagemErroImportacao(r) };
  return { tipo: "ok", pl: r };
}

export type CartaoPL = { ano: number; mes: number; empresa: string; moeda: Moeda; receita: number; lucroLiquido: number | null };

/** Números do cartão "Lançar no Consolidado": receita (total de Income) e lucro líquido (Net Income). */
export function resumoCartaoPL(r: PlQuickbooks): CartaoPL {
  return { ano: r.ano, mes: r.mes, empresa: r.empresa.slice(0, 200), moeda: r.moeda, receita: totalSecao(r, "income"), lucroLiquido: r.resumo.net_income ?? null };
}

const LIM = { contas: 5000, texto: 500, caminho: 2000, filhas: 1000 };
const txt = (v: unknown, max = LIM.texto): v is string => typeof v === "string" && v.length <= max;
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const RESUMO = ["gross_profit", "net_ordinary", "net_other", "net_income"];

function contaValida(v: unknown): v is Conta {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    txt(c.caminho, LIM.caminho) &&
    txt(c.nome) &&
    (SECOES as readonly unknown[]).includes(c.secao) &&
    (c.pai === null || txt(c.pai, LIM.caminho)) &&
    Number.isInteger(c.nivel) &&
    (c.nivel as number) >= 0 &&
    (c.nivel as number) <= 50 &&
    numero(c.valor) &&
    (c.total === undefined || numero(c.total)) &&
    Array.isArray(c.filhas) &&
    c.filhas.length <= LIM.filhas &&
    c.filhas.every((f) => txt(f, LIM.caminho))
  );
}

const mapaNumerico = (v: unknown, chaves: readonly string[]) =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v).every(([k, x]) => chaves.includes(k) && numero(x));

/** Payload salvo do plano "importar_demonstrativo" → P&L e hash (null se adulterado ou fora dos limites). */
export function lerPayloadDemonstrativo(payload: unknown): { pl: PlQuickbooks; hash: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  if (typeof o.hash !== "string" || !/^[a-f0-9]{64}$/.test(o.hash)) return null;
  if (!Number.isInteger(o.ano) || (o.ano as number) < 1900 || (o.ano as number) > 2200) return null;
  if (!Number.isInteger(o.mes) || (o.mes as number) < 1 || (o.mes as number) > 12) return null;
  if (!txt(o.empresa, 200) || !isMoeda(o.moeda)) return null;
  if (!Array.isArray(o.contas) || o.contas.length > LIM.contas || !o.contas.every(contaValida)) return null;
  if (!mapaNumerico(o.secoes, SECOES) || !mapaNumerico(o.resumo, RESUMO)) return null;
  const pl: PlQuickbooks = {
    ano: o.ano as number,
    mes: o.mes as number,
    empresa: o.empresa,
    moeda: o.moeda,
    contas: o.contas as Conta[],
    secoes: o.secoes as Partial<Record<Secao, number>>,
    resumo: o.resumo as PlQuickbooks["resumo"],
  };
  return { pl, hash: o.hash };
}

/** P&L e hash → payload do plano (a árvore já lida; o PDF não é guardado). */
export const payloadDemonstrativo = (pl: PlQuickbooks, hash: string) => ({
  ano: pl.ano,
  mes: pl.mes,
  empresa: pl.empresa.slice(0, 200),
  moeda: pl.moeda,
  contas: pl.contas,
  secoes: pl.secoes,
  resumo: pl.resumo,
  hash,
});

// ---------- Moeda do ano ----------

/** Moeda única dos períodos; "mista" se houver mais de uma; null se não houver período. */
export function moedaUnica(periodos: { moeda: string }[]): Moeda | "mista" | null {
  const ms = new Set(periodos.map((p) => p.moeda));
  if (!ms.size) return null;
  if (ms.size > 1) return "mista";
  const m = [...ms][0];
  return isMoeda(m) ? m : "mista";
}

// ---------- Conferência ----------

export const alertasAtencao = (alertas: Alerta[]) => alertas.filter((a) => a.codigo === "suspensa" || a.codigo === "distribuicao");

export type ProblemaConferir = "identidades" | "aceite";

/** Pode marcar como CONFERIDO? Exige as 6 identidades ok e, com alertas de atenção, o aceite marcado. */
export function podeConferir(linhas: Linhas, alertas: Alerta[], aceite: boolean): { ok: true } | { ok: false; problema: ProblemaConferir } {
  if (!checarIdentidades(linhas).every((i) => i.status === "ok")) return { ok: false, problema: "identidades" };
  if (alertasAtencao(alertas).length && !aceite) return { ok: false, problema: "aceite" };
  return { ok: true };
}

// ---------- Períodos com a classificação da org ----------

export type Registro = { ano: number; mes: number; status: string; linhas: Linhas; contas: ArvoreContas | null };
export type PeriodoCalculado = Periodo & { pendentes: string[]; distribuicoes: number };

/** Aplica a classificação da org a cada período (custos fixos/variáveis) e guarda as pendências e as distribuições. */
export function prepararPeriodos(registros: Registro[], mapa: Record<string, Classe>): PeriodoCalculado[] {
  return registros.map((r) => {
    const status: StatusPeriodo = r.status === "CONFERIDO" ? "CONFERIDO" : "RASCUNHO";
    if (!r.contas) return { ano: r.ano, mes: r.mes, status, linhas: r.linhas, pendentes: [], distribuicoes: 0 };
    const cl = classificar(r.contas, mapa);
    return { ano: r.ano, mes: r.mes, status, linhas: aplicarClassificacao(r.linhas, cl), pendentes: cl.pendentes, distribuicoes: distribuicoes(r.contas) };
  });
}

const uniao = (ps: PeriodoCalculado[]) => [...new Set(ps.flatMap((p) => p.pendentes))];

export type LinhaKpi = { rotulo: string; kpis: Kpis | null; lucro: number | null; ajustado: Kpi | null; situacao?: string };

/** KPIs dos 12 meses (só CONFERIDO) e dos 4 trimestres, com o lucro líquido ajustado ao lado. */
export function kpisDoAno(ano: number, periodos: PeriodoCalculado[]): { meses: LinhaKpi[]; trimestres: LinhaKpi[] } {
  const ok = periodos.filter((p) => p.ano === ano && p.status === "CONFERIDO");
  const doMes = (m: number) => ok.find((p) => p.mes === m);
  const meses = Array.from({ length: 12 }, (_, i): LinhaKpi => {
    const p = doMes(i + 1);
    if (!p) return { rotulo: String(i + 1), kpis: null, lucro: null, ajustado: null };
    const anterior = i === 0 ? periodos.find((x) => x.ano === ano - 1 && x.mes === 12 && x.status === "CONFERIDO") : doMes(i);
    return {
      rotulo: String(i + 1),
      kpis: kpis(p, anterior, { pendentesClassificacao: p.pendentes }),
      lucro: p.linhas.lucro_liquido ?? null,
      ajustado: kpisOpcionais(p.linhas, { distribuicoes: p.distribuicoes }).lucro_liquido_ajustado,
    };
  });
  const trimestres = [0, 1, 2, 3].map((t): LinhaKpi => {
    const ps = ok.filter((p) => p.mes > t * 3 && p.mes <= t * 3 + 3);
    const r = kpisTrimestre(ps, { pendentesClassificacao: uniao(ps) });
    const dist = ps.reduce((s, p) => s + p.distribuicoes, 0);
    return { rotulo: `T${t + 1}`, kpis: ps.length ? r.kpis : null, lucro: ps.length ? (r.linhas.lucro_liquido ?? null) : null, ajustado: ps.length ? kpisOpcionais(r.linhas, { distribuicoes: dist }).lucro_liquido_ajustado : null, situacao: r.situacao };
  });
  return { meses, trimestres };
}

/** Pendências de classificação somadas dos períodos conferidos do ano (para a planilha). */
export const pendentesDoAno = (ano: number, periodos: PeriodoCalculado[]) => uniao(periodos.filter((p) => p.ano === ano && p.status === "CONFERIDO"));

/** Linhas de ClassificacaoConta → mapa conta → classe (ignora classe desconhecida). */
export const mapaDeClasses = (rows: { conta: string; classe: string }[]): Record<string, Classe> =>
  Object.fromEntries(rows.filter((r) => isClasse(r.classe)).map((r) => [r.conta, r.classe as Classe]));

/** JSON salvo → árvore de contas (null se não tiver o formato esperado). */
export function arvoreSalva(v: unknown): ArvoreContas | null {
  if (!v || typeof v !== "object" || !Array.isArray((v as ArvoreContas).contas)) return null;
  return v as ArvoreContas;
}
