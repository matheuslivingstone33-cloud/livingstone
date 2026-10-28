// Retenção de dados operacionais. Puro.
// ApiRequest guarda chaves de idempotência (válidas por 24 h, ver IDEMPOTENCY_TTL_MS) e o rate limit (60 s).
// Depois disso o registro não serve para nada e pode ser apagado pelo cron diário.

/** Instante de corte: registros com createdAt anterior a este podem ser apagados. */
export function cutoffApiRequests(now: Date, horas = 24): Date {
  if (!(horas > 0)) throw new Error("horas deve ser positivo");
  return new Date(now.getTime() - horas * 60 * 60 * 1000);
}

/** Conversas do assistente (AssistantMessageLog) ficam 180 dias; antes do corte, o cron apaga. */
export function cutoffConversas(now: Date, dias = 180): Date {
  if (!(dias > 0)) throw new Error("dias deve ser positivo");
  return new Date(now.getTime() - dias * 24 * 60 * 60 * 1000);
}
