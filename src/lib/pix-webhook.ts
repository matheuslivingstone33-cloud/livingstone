// Webhook Pix: de onde vem o segredo. Puro.
// O header x-webhook-secret é o caminho padrão e tem precedência. ?secret= na URL só vale com allowQuery
// (PIX_WEBHOOK_ALLOW_QUERY_SECRET=1), porque URLs com segredo vazam em logs de proxy, do PSP e da Vercel.
export function pickWebhookSecret(headers: Headers, url: string, allowQuery: boolean): string {
  const h = headers.get("x-webhook-secret");
  if (h) return h;
  if (!allowQuery) return "";
  return new URL(url).searchParams.get("secret") ?? "";
}
