// Conferência do que a IA devolve: puro, sem rede nem banco. Se a IA perder um fato do texto
// determinístico (valor, data, contrato, link, referência normativa) ou trouxer um fato que não
// está nele (valor, percentual, data, contrato, domínio, número), o texto dela é rejeitado.
import { fmtBRL } from "./format";

export type GuardResult = { ok: boolean; missing: string[] };
/** Como a IA entrou no resultado exibido. */
export type AiStatus = "usada" | "rejeitada" | "falhou" | "desligada" | "bloqueada_limite";

/** NBSP/espaços estreitos viram espaço, espaços repetidos colapsam e "R$ 1,00" = "R$1,00". */
export const normalizeText = (s: string) =>
  s.replace(/[   ]/g, " ").replace(/\s+/g, " ").replace(/R\$ /g, "R$").trim();

export type FactKind = "url" | "dominio" | "documento" | "valor" | "percentual" | "data" | "fracao" | "parcelas" | "contrato" | "numero";
export type Fact = { kind: FactKind; value: string };

const B = String.raw`(?<![\w\-])`;
const E = String.raw`(?![\w\-])`;
// Ordem importa: cada padrão encontrado é apagado do texto antes do próximo
const PATTERNS: [FactKind, RegExp][] = [
  ["url", /https?:\/\/[^\s<>"']+/gi],
  ["dominio", new RegExp(String.raw`(?<![\w\-.@])(?:[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?`, "gi")],
  ["documento", new RegExp(String.raw`${B}(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})${E}`, "g")],
  ["valor", new RegExp(String.raw`R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?${E}`, "g")],
  ["percentual", new RegExp(String.raw`${B}\d+(?:[.,]\d+)?\s?%`, "g")],
  ["data", new RegExp(String.raw`${B}\d{2}\/\d{2}\/\d{4}${E}`, "g")],
  ["fracao", new RegExp(String.raw`${B}\d+(?:\.\d+)*\/\d+${E}`, "g")],
  ["parcelas", new RegExp(String.raw`${B}\d+x${E}`, "gi")],
  ["contrato", new RegExp(String.raw`${B}(?=[A-Za-z0-9\-]*\d)(?=[A-Za-z0-9\-]*[A-Za-z])[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*${E}`, "g")],
  ["numero", new RegExp(String.raw`${B}\d+(?:[.,]\d+)*${E}`, "g")],
];

const clean = (kind: FactKind, v: string) => {
  let x = v.replace(/\s+/g, "");
  if (kind === "url" || kind === "dominio") x = x.toLowerCase().replace(/[.,;:!?)\]}"'»]+$/, "");
  if (kind === "parcelas" || kind === "contrato") x = x.toUpperCase();
  return x;
};

/** Fatos verificáveis de um texto: valores, percentuais, datas, parcelas, códigos, domínios e números. */
export function factTokens(s: string): Fact[] {
  let t = normalizeText(s);
  const out: Fact[] = [];
  for (const [kind, re] of PATTERNS) {
    t = t.replace(re, (m) => {
      const value = clean(kind, m);
      if (value) out.push({ kind, value });
      return " ";
    });
  }
  return out;
}

const key = (f: Fact) => `${f.kind}:${f.value}`;

/** Conjunto permitido: os fatos da base, mais a forma sem "R$" de cada valor. */
function allowedSet(base: string, extra: string[] = []): Set<string> {
  const set = new Set<string>();
  for (const f of factTokens([base, ...extra].join("\n"))) {
    set.add(key(f));
    if (f.kind === "valor") set.add(`numero:${f.value.replace("R$", "")}`);
    if (f.kind === "url") set.add(`dominio:${f.value.replace(/^https?:\/\//, "")}`);
  }
  return set;
}

const LABEL: Record<FactKind, string> = {
  url: "link",
  dominio: "domínio",
  documento: "documento",
  valor: "valor",
  percentual: "percentual",
  data: "data",
  fracao: "número",
  parcelas: "parcelamento",
  contrato: "contrato",
  numero: "número",
};
const show = (f: Fact) => (f.kind === "valor" ? f.value.replace("R$", "R$ ") : f.value).slice(0, 80);

/** Fatos do texto da IA que não existem na base, com motivo legível. */
export function extraFacts(ai: string, base: string, extra: string[] = []): string[] {
  const allowed = allowedSet(base, extra);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of factTokens(ai)) {
    const k = key(f);
    if (allowed.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(`${LABEL[f.kind]} não permitido: ${show(f)}`);
  }
  return out;
}

export type CollectionValues = { cashTotal: number; discountPct: number; installments?: number; installment?: number };

export function checkCollectionMessage(
  msg: unknown,
  ref: { values: CollectionValues; contract: string; link: string; base?: string; days?: number },
): GuardResult {
  if (typeof msg !== "string" || !msg.trim()) return { ok: false, missing: ["mensagem vazia"] };
  if (msg.length > 1000) return { ok: false, missing: ["mensagem acima de 1000 caracteres"] };
  const t = normalizeText(msg);
  const missing: string[] = [];
  const required: string[] = [];
  const need = (token: string) => {
    required.push(token);
    if (!t.includes(normalizeText(token))) missing.push(token);
  };
  const v = ref.values;
  need(fmtBRL(v.cashTotal));
  if (v.discountPct > 0) need(`${v.discountPct.toFixed(0)}%`);
  if (v.installments && v.installments > 1 && v.installment) {
    need(`${v.installments}x`);
    need(fmtBRL(v.installment));
  }
  need(ref.contract);
  need(ref.link);
  // Todo fato da mensagem precisa existir na base (ou nos valores exigidos / dias de atraso)
  const extra = [...required, ...(ref.days !== undefined ? [`${ref.days}`] : [])];
  missing.push(...extraFacts(t, ref.base ?? "", extra));
  return { ok: missing.length === 0, missing };
}

/** Fatos do dossiê determinístico que a versão da IA precisa repetir. */
export function dossierTokens(base: string): string[] {
  const b = normalizeText(base);
  const tokens = [
    ...(b.match(/R\$\s?[\d.]+,\d{2}/g) ?? []),
    ...(b.match(/\d{2}\/\d{2}\/\d{4}/g) ?? []),
    ...(b.match(/(Lei|Carta Circular BCB|Circular BCB|Resolução)\s[\d.\/]+/gi) ?? []).map((r) => r.replace(/[./]+$/, "")),
    ...(b.match(/\b(?:CPF|CNPJ) ([\d.\/-]{11,18})/g) ?? []).map((m) => m.replace(/^(CPF|CNPJ) /, "")),
    ...(b.match(/\b\d{1,3}\/100\b/g) ?? []),
  ];
  return [...new Set(tokens)];
}

export const NEGATIONS = ["não", "nunca", "jamais", "nenhum", "nenhuma", "sem", "inexistente"];
const negationCount = (s: string, w: string) => (s.toLowerCase().match(new RegExp(String.raw`(?<!\p{L})${w}(?!\p{L})`, "gu")) ?? []).length;

export function checkDossier(ai: unknown, base: string): GuardResult {
  if (typeof ai !== "string" || !ai.trim()) return { ok: false, missing: ["texto vazio"] };
  if (ai.length > 30_000) return { ok: false, missing: ["texto acima de 30000 caracteres"] };
  const t = normalizeText(ai).toLowerCase();
  const missing = dossierTokens(base).filter((tok) => !t.includes(tok.toLowerCase()));
  missing.push(...extraFacts(ai, base));
  // Negação nova inverte o sentido de um fato ("movimentou" → "não movimentou")
  for (const w of NEGATIONS) if (negationCount(ai, w) > negationCount(base, w)) missing.push(`negação nova: "${w}"`);
  return { ok: missing.length === 0, missing };
}

export const checkCreditOpinion = (txt: unknown): txt is string => typeof txt === "string" && txt.trim().length >= 1 && txt.length <= 2000;

export function isLegacyShape(x: unknown): x is { summary: string; modernCode: string; rules: { onde: string; regra: string }[] } {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.summary === "string" &&
    o.summary.trim().length > 0 &&
    typeof o.modernCode === "string" &&
    Array.isArray(o.rules) &&
    o.rules.length <= 500 &&
    o.rules.every((r) => !!r && typeof r === "object" && typeof (r as Record<string, unknown>).onde === "string" && typeof (r as Record<string, unknown>).regra === "string")
  );
}
