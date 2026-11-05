// Moeda e formatos de planilha. Puro e sem node:crypto: pode ser importado por componentes do navegador.

export const MOEDAS = ["BRL", "USD"] as const;
export type Moeda = (typeof MOEDAS)[number];
export const ROTULO_MOEDA: Record<Moeda, string> = { BRL: "Real (R$)", USD: "Dólar (US$)" };
export const isMoeda = (v: unknown): v is Moeda => typeof v === "string" && (MOEDAS as readonly string[]).includes(v);

/** Formatos de data aceitos no layout. Novos formatos entram sempre no fim (a ordem decide empates). */
export const FORMATOS_DATA = ["dd/mm/aaaa", "aaaa-mm-dd", "mm/dd/aaaa", "dd-mm-aaaa", "dd.mm.aaaa", "aaaammdd", "mmm dd, aaaa", "dd-mmm-aaaa", "mm/dd/aa", "dd/mm/aa"] as const;
export type FormatoData = (typeof FORMATOS_DATA)[number];
/** br: vírgula decimal · ponto: ponto decimal sem milhar · us: "1,234.56" (vírgula de milhar, ponto decimal). */
export const FORMATOS_VALOR = ["br", "ponto", "us"] as const;
export type FormatoValor = (typeof FORMATOS_VALOR)[number];

export type LocaleUi = "pt" | "en";
const SIMBOLO: Record<Moeda, string> = { BRL: "R$", USD: "US$" };

/**
 * Valor na moeda do dado, no formato do idioma da interface. O símbolo é sempre explícito (R$ / US$):
 * pt → "R$ 1.234,56" / "US$ 1.234,56" · en → "R$1,234.56" / "US$1,234.56".
 * Com BRL em pt, o texto é idêntico ao toLocaleString("pt-BR", BRL) usado antes.
 */
export function fmtMoeda(n: number, moeda: Moeda = "BRL", locale: LocaleUi = "pt"): string {
  const nf = new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", { style: "currency", currency: moeda });
  return nf
    .formatToParts(n)
    .map((p) => (p.type === "currency" ? SIMBOLO[moeda] : p.value))
    .join("");
}

/** Centavos inteiros → texto na moeda. */
export const fmtCentavos = (c: number, moeda: Moeda = "BRL", locale: LocaleUi = "pt") => fmtMoeda(c / 100, moeda, locale);
