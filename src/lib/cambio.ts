// Câmbio manual na conciliação: cotação informada pelo usuário, conversão em aritmética inteira e a pista
// "diferença de câmbio". Puro: sem banco nem Next. O sistema nunca busca cotação; a pista nunca muda o status.
import type { ItemStatus } from "./reconcile";
import type { Moeda } from "./moeda";

/** Cotação sempre como "reais por 1 dólar" (ex.: 5,4321). micro = cotação × 1.000.000 (inteiro). */
export type Cotacao = { texto: string; micro: bigint };
export const COTACAO_MAX_CASAS = 6;
const MILHAO = BigInt(1_000_000);
const ZERO = BigInt(0);
const DOIS = BigInt(2);
export const TOLERANCIA_CAMBIO_PADRAO = 0.5;
export const TOLERANCIA_CAMBIO_MAX = 10;

/** "5,4321" ou "5.4321" → cotação positiva com até 6 casas; null se inválida. Sem milhar nem notação científica. */
export function parseCotacao(raw: unknown): Cotacao | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim().replace(",", ".");
  const m = s.match(/^(\d{1,6})(?:\.(\d{1,6}))?$/);
  if (!m) return null;
  const micro = BigInt(m[1]) * MILHAO + BigInt((m[2] ?? "").padEnd(6, "0"));
  if (micro <= ZERO) return null;
  // Texto canônico: sem zeros sobrando à direita ("5.432100" → "5.4321")
  const frac = (m[2] ?? "").replace(/0+$/, "");
  return { texto: `${BigInt(m[1])}${frac ? `.${frac}` : ""}`, micro };
}

/** Tolerância em % (0 a 10, até 2 casas). Vazio → padrão 0,5%. null se inválida. */
export function parseToleranciaPct(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return TOLERANCIA_CAMBIO_PADRAO;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n <= TOLERANCIA_CAMBIO_MAX ? n : null;
}

// Divisão inteira com arredondamento comercial (meio para cima), para não negativos
const divRound = (a: bigint, b: bigint) => (a * DOIS + b) / (b * DOIS);

/**
 * Centavos de `de` → centavos de `para`, só com inteiros. USD → BRL multiplica pela cotação; BRL → USD divide.
 * Ex.: 10000 (US$ 100,00) × 5,4321 = 54321 (R$ 543,21). Mesma moeda: devolve o próprio valor.
 */
export function converterCentavos(centavos: number, de: Moeda, para: Moeda, cotacao: Cotacao): number {
  if (!Number.isSafeInteger(centavos)) throw new RangeError("Centavos devem ser inteiros.");
  if (de === para) return centavos;
  const neg = centavos < 0;
  const c = BigInt(Math.abs(centavos));
  const r = de === "USD" ? divRound(c * cotacao.micro, MILHAO) : divRound(c * MILHAO, cotacao.micro);
  const n = Number(r);
  return neg ? -n : n;
}

/** Câmbio congelado na conciliação (options.cambio). A cotação fica em texto para não perder casas. */
export type CambioInfo = {
  moedaEsperados: Moeda;
  moedaExtrato: Moeda;
  /** Moeda base da conciliação: a dos esperados. */
  base: Moeda;
  cotacao: string;
  toleranciaPct: number;
  informadaPor: string;
  informadaEm: string;
};

type ItemCambio = { status: ItemStatus; expectedAmount?: number; receivedAmount?: number };

/**
 * Pista "diferença de câmbio": só em DIVERGENTE com os dois valores, quando a diferença (na moeda base)
 * fica dentro de toleranciaPct do valor esperado. Mesmo molde de explicadoTaxa: o status não muda.
 */
export function explicadoCambio(item: ItemCambio, toleranciaPct: number): boolean {
  if (item.status !== "DIVERGENTE" || item.expectedAmount === undefined || item.receivedAmount === undefined) return false;
  const esp = Math.round(item.expectedAmount * 100);
  const diff = Math.abs(Math.round(item.receivedAmount * 100) - esp);
  // Tolerância em centésimos de ponto percentual, tudo inteiro: |dif| × 10000 ≤ esperado × pct×100
  const pctCent = Math.round(toleranciaPct * 100);
  return diff > 0 && diff * 10_000 <= esp * pctCent;
}

/** Moedas diferentes sem cotação: a conciliação é recusada. */
export class CambioError extends Error {}
export const SEM_COTACAO = "As planilhas estão em moedas diferentes: informe a cotação usada (R$ por US$ 1). O sistema não busca câmbio automaticamente.";

/** Converte os créditos do extrato para a moeda base; devolve também os valores originais em centavos (mesma ordem). */
export function converterEntradas<E extends { amount: number }>(entries: E[], de: Moeda, para: Moeda, cotacao: Cotacao): { entries: E[]; originaisCentavos: number[] } {
  const originaisCentavos = entries.map((e) => Math.round(e.amount * 100));
  return { entries: entries.map((e, j) => ({ ...e, amount: converterCentavos(originaisCentavos[j], de, para, cotacao) / 100 })), originaisCentavos };
}
