// Variáveis de ambiente: leitura com falha fechada. Puro (só lê o objeto recebido).
//
// Obrigatórias em produção:
//   DATABASE_URL   conexão usada pela aplicação (na Vercel: pooler, ex. ?pgbouncer=true&connection_limit=1)
//   DIRECT_URL     conexão direta (migrações). Localmente, igual a DATABASE_URL.
//   AUTH_SECRET    assinatura da sessão (mínimo 32 caracteres)
//   APP_URL        URL pública do ambiente (links de acordo, webhook)
//   CRON_SECRET    protege /api/cron/limpeza (sem ele a rota responde 401)
// Opcionais:
//   AUDIT_RECEIPT_SECRET            segredo próprio do recibo (≥32); sem ele, derivado do AUTH_SECRET
//   ANTHROPIC_API_KEY / ANTHROPIC_MODEL   IA; sem chave, os módulos seguem sem a parte de IA
//   PIX_KEY / PIX_MERCHANT / PIX_CITY     padrão do Pix
//   PIX_WEBHOOK_ALLOW_QUERY_SECRET  "1" aceita ?secret= no webhook Pix (só para PSP sem header customizado)
export const ENV_REQUIRED = ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "APP_URL", "CRON_SECRET"] as const;
export const ENV_OPTIONAL = ["AUDIT_RECEIPT_SECRET", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "PIX_KEY", "PIX_MERCHANT", "PIX_CITY", "PIX_WEBHOOK_ALLOW_QUERY_SECRET"] as const;

/** Lê uma variável obrigatória; ausente, vazia ou curta demais lança erro (sem expor o valor). */
export function requiredEnv(name: string, opts: { minLength?: number } = {}, env: Record<string, string | undefined> = process.env): string {
  const v = env[name];
  if (!v || !v.trim()) throw new Error(`Variável de ambiente ${name} ausente.`);
  if (opts.minLength && v.length < opts.minLength) throw new Error(`Variável de ambiente ${name} curta demais (mínimo ${opts.minLength} caracteres).`);
  return v;
}
