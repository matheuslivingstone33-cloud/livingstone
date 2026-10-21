// Preparação de um lote de PLD: tudo o que vai para o banco, calculado sem banco, sem Next e sem relógio.
import { analyzeClient, groupByClient, scoreOf, type Alert, type PldCfg, type Tx } from "./pld";
import type { ListIndex } from "./lists";

/** Regras que tornam a comunicação obrigatória (abrem caso mesmo abaixo da pontuação mínima). */
export const MANDATORY_RULES = ["ESPECIE_50K", "CLIENTE_LISTA_RESTRITIVA"];

/** Limite de transações por upload (teto lógico). Na prática o limite de 4 MB por arquivo chega antes:
 * public/demo/transacoes_pld.csv tem ~112 bytes/linha (6.169 bytes, 55 linhas); com linhas de ~90 a 112 bytes,
 * 4 MB comportam ~37 a 46 mil transações. */
export const PLD_MAX_TRANSACOES = 100_000;

const DAY = 86_400_000;

/** Menor e maior data das transações, sem espalhar o array (não estoura a pilha com centenas de milhares). */
export function periodo(txs: { date: Date }[]) {
  if (!txs.length) throw new Error("Lote sem transações: não há período.");
  let min = Infinity;
  let max = -Infinity;
  for (const t of txs) {
    const v = t.date.getTime();
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { periodStart: new Date(min), periodEnd: new Date(max) };
}

export type CasoPreparado = {
  clientDoc: string;
  clientName: string;
  declaredIncome: number | undefined;
  pep: boolean;
  score: number;
  risk: string;
  alerts: Alert[];
  totalIn: number;
  totalOut: number;
  mandatory: boolean;
  dueAt: Date;
};

export function prepararLote(txs: Tx[], cfg: PldCfg, listIndex: ListIndex, agora: Date) {
  const { periodStart, periodEnd } = periodo(txs);
  const grupos = groupByClient(txs);
  const dueAt = new Date(agora.getTime() + cfg.analysisDays * DAY); // prazo de análise (Circular 3.978, art. 43)
  const casos: CasoPreparado[] = [];
  let alertas = 0;
  for (const list of grupos.values()) {
    const alerts = analyzeClient(list, cfg, listIndex);
    const { score, risk } = scoreOf(alerts);
    const mandatory = alerts.some((a) => MANDATORY_RULES.includes(a.rule));
    if (!(score >= cfg.caseMinScore || mandatory)) continue;
    let totalIn = 0;
    let totalOut = 0;
    for (const t of list) {
      if (t.direction === "C") totalIn += t.amount;
      else if (t.direction === "D") totalOut += t.amount;
    }
    const first = list[0];
    alertas += alerts.length;
    casos.push({
      clientDoc: first.clientDoc,
      clientName: first.clientName,
      declaredIncome: first.income,
      pep: first.pep || alerts.some((a) => a.rule === "PEP"),
      score,
      risk,
      alerts,
      totalIn,
      totalOut,
      mandatory,
      dueAt,
    });
  }
  return { transacoes: txs.length, clientes: grupos.size, alertas, periodStart, periodEnd, casos };
}

/** Linhas por INSERT para não passar do limite de parâmetros do Postgres (65.535). */
export function tamanhoChunk(colunas: number, limite = 65_535, folga = 0.5) {
  if (colunas < 1) throw new Error("Número de colunas inválido.");
  return Math.max(1, Math.min(2000, Math.floor((limite * folga) / colunas)));
}

export function chunk<T>(arr: T[], n: number): T[][] {
  if (!Number.isInteger(n) || n < 1) throw new Error("Tamanho de bloco inválido.");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
