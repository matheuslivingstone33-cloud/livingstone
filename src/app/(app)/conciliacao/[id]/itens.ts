// Conversões dos itens gravados para as frases da prova (Decimal → number).
import type { ReconciliationItem } from "@prisma/client";
import { normRef } from "@/lib/reconcile";
import type { ItemFrase } from "@/lib/prova-conciliacao";
import { fmtMoeda, isMoeda, type Moeda } from "@/lib/moeda";
import type { CambioInfo } from "@/lib/cambio";

export type SemProva = Omit<ReconciliationItem, "evidence">;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
export const paraFrase = (i: SemProva): ItemFrase => ({ ...i, expectedAmount: n(i.expectedAmount), receivedAmount: n(i.receivedAmount) });
/** Títulos que já tiveram pagamento: um crédito sem par com a mesma referência é possível duplicidade. */
export const referenciasPagas = (items: SemProva[]) => new Set(items.filter((i) => i.expectedAmount !== null && i.receivedAmount !== null).map((i) => normRef(i.reference)));

/** Linhas da taxa de cartão do item (bruto esperado, taxa, líquido esperado e recebido), ou null sem regra aplicada. */
export function linhasTaxa(i: Pick<SemProva, "expectedAmount" | "receivedAmount" | "taxaEsperada">) {
  const bruto = n(i.expectedAmount);
  const taxa = n(i.taxaEsperada);
  if (bruto === null || taxa === null) return null;
  return { bruto, taxa, liquido: Math.round(bruto * 100 - taxa * 100) / 100, recebido: n(i.receivedAmount) };
}

export type FiltroTaxa = "explicada" | "outras";
export const filtroTaxaDe = (v: unknown): FiltroTaxa | undefined => (v === "explicada" || v === "outras" ? v : undefined);

/** Moeda gravada na conciliação; conciliação antiga (ou valor estranho) é BRL. */
export const moedaDe = (currency: unknown): Moeda => (isMoeda(currency) ? currency : "BRL");
/** Valor (Decimal/number) na moeda da conciliação; nulo vira travessão. */
export const valorNa = (moeda: Moeda) => (v: unknown) => (v === null || v === undefined ? "—" : fmtMoeda(Number(v), moeda));

/** Câmbio congelado em options.cambio, ou null (conciliação sem câmbio ou antiga). */
export function cambioDe(options: unknown): CambioInfo | null {
  const c = options && typeof options === "object" && !Array.isArray(options) ? (options as Record<string, unknown>).cambio : undefined;
  if (!c || typeof c !== "object") return null;
  const x = c as Partial<CambioInfo>;
  return isMoeda(x.moedaEsperados) && isMoeda(x.moedaExtrato) && typeof x.cotacao === "string" ? (x as CambioInfo) : null;
}

export type FiltroCambio = "explicada" | "outras";
export const filtroCambioDe = (v: unknown): FiltroCambio | undefined => (v === "explicada" || v === "outras" ? v : undefined);
