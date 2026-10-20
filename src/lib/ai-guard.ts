// Conferência do que a IA devolve: puro, sem rede nem banco. Se a IA perder um fato do texto
// determinístico (valor, data, contrato, link, referência normativa), o texto dela é rejeitado.
import { fmtBRL } from "./format";

export type GuardResult = { ok: boolean; missing: string[] };
/** Como a IA entrou no resultado exibido. */
export type AiStatus = "usada" | "rejeitada" | "falhou" | "desligada";

/** NBSP/espaços estreitos viram espaço, espaços repetidos colapsam e "R$ 1,00" = "R$1,00". */
export const normalizeText = (s: string) =>
  s.replace(/[   ]/g, " ").replace(/\s+/g, " ").replace(/R\$ /g, "R$").trim();

const urlsIn = (s: string) => (s.match(/https?:\/\/\S+/g) ?? []).map((u) => u.replace(/[.,;:!?)\]}"'»]+$/, ""));

export type CollectionValues = { cashTotal: number; discountPct: number; installments?: number; installment?: number };

export function checkCollectionMessage(msg: unknown, ref: { values: CollectionValues; contract: string; link: string }): GuardResult {
  if (typeof msg !== "string" || !msg.trim()) return { ok: false, missing: ["mensagem vazia"] };
  if (msg.length > 1000) return { ok: false, missing: ["mensagem acima de 1000 caracteres"] };
  const t = normalizeText(msg);
  const missing: string[] = [];
  const need = (token: string) => {
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
  for (const u of urlsIn(t)) if (u !== ref.link) missing.push(`URL não permitida: ${u.slice(0, 80)}`);
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

export function checkDossier(ai: unknown, base: string): GuardResult {
  if (typeof ai !== "string" || !ai.trim()) return { ok: false, missing: ["texto vazio"] };
  if (ai.length > 30_000) return { ok: false, missing: ["texto acima de 30000 caracteres"] };
  const t = normalizeText(ai).toLowerCase();
  const missing = dossierTokens(base).filter((tok) => !t.includes(tok.toLowerCase()));
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
