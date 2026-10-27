// Taxa de cartão na conciliação: pista determinística para o item com valor diferente.
// Puro: sem banco, sem Next e sem @/lib/settings. A taxa nunca muda o status do item; só explica a diferença.
import { normHeader } from "./layout-conciliacao";
import type { ItemStatus } from "./reconcile";
import type { TaxaRecebimento } from "./settings-defaults";

export type { TaxaRecebimento };

export const TAXAS_MAX = 20;
const cents = (n: number) => Math.round(n * 100);

/** Taxa esperada em centavos sobre o bruto (em centavos): arredondamento comercial da parte percentual + parte fixa. */
export const taxaEsperadaCentavos = (brutoCentavos: number, pct: number, fixoCentavos = 0) => Math.round(brutoCentavos * pct) + fixoCentavos;

/** Regra configurada para a forma do título (comparação sem acento, caixa nem separadores). */
export function regraDaForma(forma: string | undefined, taxas: readonly TaxaRecebimento[] | undefined): TaxaRecebimento | undefined {
  if (!forma || !Array.isArray(taxas)) return undefined;
  const k = normHeader(forma);
  if (!k) return undefined;
  return taxas.find((t) => t && typeof t.tipo === "string" && normHeader(t.tipo) === k);
}

export type ClassificacaoTaxa = {
  /** Forma como veio no arquivo de esperados (até 40 caracteres). */
  formaPagamento?: string;
  /** Taxa esperada em reais, quando há regra para a forma e valor esperado. */
  taxaEsperada?: number;
  /** Só verdadeiro em DIVERGENTE pago a menor cuja diferença bate com a taxa (dentro da tolerância da regra). */
  explicadoTaxa: boolean;
};

type ItemTaxa = { status: ItemStatus; expectedAmount?: number; receivedAmount?: number };

export function classificarTaxa(item: ItemTaxa, forma: string | undefined, taxas: readonly TaxaRecebimento[] | undefined): ClassificacaoTaxa {
  const formaPagamento = forma?.trim().slice(0, 40) || undefined;
  const regra = regraDaForma(formaPagamento, taxas);
  if (!regra || item.expectedAmount === undefined) return { formaPagamento, explicadoTaxa: false };
  const taxa = taxaEsperadaCentavos(cents(item.expectedAmount), regra.pct, regra.fixoCentavos ?? 0);
  const out = { formaPagamento, taxaEsperada: taxa / 100, explicadoTaxa: false };
  if (item.status !== "DIVERGENTE" || item.receivedAmount === undefined) return out;
  const diff = cents(item.receivedAmount) - cents(item.expectedAmount);
  out.explicadoTaxa = diff < 0 && Math.abs(-diff - taxa) <= (regra.toleranciaCentavos ?? 0);
  return out;
}

/** Validação das regras ao salvar a configuração. null = ok. */
export function validarTaxas(taxas: unknown): string | null {
  if (!Array.isArray(taxas)) return "Taxas de recebimento: lista inválida.";
  if (taxas.length > TAXAS_MAX) return `Taxas de recebimento: no máximo ${TAXAS_MAX} formas.`;
  const vistos = new Set<string>();
  const between = (v: unknown, a: number, b: number) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
  for (const t of taxas as Partial<TaxaRecebimento>[]) {
    const k = typeof t?.tipo === "string" ? normHeader(t.tipo) : "";
    if (!k) return "Taxas de recebimento: informe a forma de recebimento de cada linha.";
    const nome = `"${String(t.tipo).slice(0, 40)}"`;
    if (vistos.has(k)) return `Taxas de recebimento: a forma ${nome} aparece mais de uma vez.`;
    vistos.add(k);
    if (typeof t.rotulo !== "string" || t.rotulo.length > 40) return `Taxas de recebimento: rótulo inválido em ${nome}.`;
    if (!between(t.pct, 0, 0.2)) return `Taxas de recebimento: o percentual de ${nome} deve ficar entre 0 e 20%.`;
    if (!between(t.fixoCentavos, 0, 1000) || !Number.isInteger(t.fixoCentavos)) return `Taxas de recebimento: a parte fixa de ${nome} deve ficar entre R$ 0,00 e R$ 10,00.`;
    if (!between(t.toleranciaCentavos, 0, 100) || !Number.isInteger(t.toleranciaCentavos)) return `Taxas de recebimento: a tolerância de ${nome} deve ser de 0 a 100 centavos.`;
  }
  return null;
}
