// Webhook Pix: de onde vem o segredo. Puro.
// O header x-webhook-secret é o caminho padrão e tem precedência. ?secret= na URL só vale com allowQuery
// (PIX_WEBHOOK_ALLOW_QUERY_SECRET=1), porque URLs com segredo vazam em logs de proxy, do PSP e da Vercel.
export function pickWebhookSecret(headers: Headers, url: string, allowQuery: boolean): string {
  const h = headers.get("x-webhook-secret");
  if (h) return h;
  if (!allowQuery) return "";
  return new URL(url).searchParams.get("secret") ?? "";
}

// Limites do lote: cabe com folga nos 60 s da função na Vercel
export const WEBHOOK_MAX_EVENTS = 100;
export const WEBHOOK_BUDGET_MS = 45_000;

/** Lote acima do máximo é recusado inteiro (o PSP reenvia dividido). */
export function planWebhookBatch(len: number, max = WEBHOOK_MAX_EVENTS): { ok: true } | { ok: false; erro: "lote_grande"; maximo: number } {
  return len <= max ? { ok: true } : { ok: false, erro: "lote_grande", maximo: max };
}

/** true quando o tempo gasto desde startedAt já atingiu o orçamento. */
export const outOfBudget = (startedAt: number, now: number, budget = WEBHOOK_BUDGET_MS) => now - startedAt >= budget;
