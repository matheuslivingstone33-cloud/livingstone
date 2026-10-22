// Webhook Pix (padrão da API Pix do Banco Central): o PSP avisa cada Pix recebido e o acordo é baixado automaticamente.
// URL a cadastrar no PSP: {APP_URL}/api/pix/webhook/{orgId}  (o PSP costuma acrescentar "/pix" ao final),
// com o segredo no header x-webhook-secret. ?secret= na URL só é aceito com PIX_WEBHOOK_ALLOW_QUERY_SECRET=1
// (exceção para PSP que não envia header customizado: a URL com segredo aparece em logs).
// Em produção, prefira também mTLS no PSP/proxy; o segredo aqui é uma segunda camada.
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { auditRaw } from "@/lib/auth";
import { parseTxid } from "@/lib/collection";
import { getSettings } from "@/lib/settings";
import { applyPayment } from "@/lib/payments";
import { pickWebhookSecret } from "@/lib/pix-webhook";

// Lote de até 500 eventos: na Vercel a função tem até 60 s
export const maxDuration = 60;

type PixEvent = { endToEndId?: string; txid?: string; valor?: string; horario?: string };

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  const secret = org ? (await getSettings(orgId)).pix.webhookSecret : "";
  const given = pickWebhookSecret(req.headers, req.url, process.env.PIX_WEBHOOK_ALLOW_QUERY_SECRET === "1");
  // Mesma resposta para organização inexistente ou segredo errado: não revela quais IDs existem
  if (!org || !secret || secret.length < 24 || !safeEqual(given, secret)) return new Response("Não autorizado", { status: 401 });

  let body: { pix?: PixEvent[] };
  try {
    body = await req.json();
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  const events = Array.isArray(body.pix) ? body.pix.slice(0, 500) : [];
  const results: Record<string, string> = {};

  for (const ev of events) {
    const key = ev.endToEndId ?? ev.txid ?? "?";
    const ref = ev.txid ? parseTxid(ev.txid) : null;
    const amount = Number(ev.valor);
    if (!ref || !ev.endToEndId || !(Number.isFinite(amount) && amount > 0)) {
      results[key] = "ignorado";
      continue;
    }
    const a = await db.agreement.findFirst({ where: { token: ref.tokenPrefix, debt: { orgId } }, include: { debt: true } });
    if (!a) {
      results[key] = "acordo_nao_encontrado";
      continue;
    }
    const paidAt = ev.horario && !isNaN(Date.parse(ev.horario)) ? new Date(ev.horario) : new Date();
    const r = await applyPayment({ agreementId: a.id, amount, paidAt, source: "PIX_WEBHOOK", endToEndId: ev.endToEndId, txid: ev.txid });
    results[key] = r.overpaid ? "applied_overpaid" : r.status;
    if (r.status === "applied")
      await auditRaw(orgId, null, "cobranca.pix_webhook", `Contrato ${a.debt.contract}: R$ ${amount.toFixed(2)} (parcela ${ref.installment}, E2E ${ev.endToEndId})`);
    if (r.overpaid)
      await auditRaw(orgId, null, "cobranca.pix_excedente", `Contrato ${a.debt.contract}: Pix de R$ ${amount.toFixed(2)} excede o saldo em R$ ${r.overpaid.toFixed(2)} (E2E ${ev.endToEndId}). Revisar devolução.`);
    // Nenhum Pix recebido fica sem rastro, mesmo quando não pode ser aplicado
    if (r.status === "not_payable")
      await auditRaw(orgId, null, "cobranca.pix_nao_aplicado", `Contrato ${a.debt.contract}: Pix de R$ ${amount.toFixed(2)} com acordo ${r.agreementStatus} (E2E ${ev.endToEndId}). Revisar.`);
  }
  // 200 mesmo com eventos ignorados: o PSP não deve reenviar o lote; duplicados são descartados pelo endToEndId
  return Response.json({ recebidos: events.length, resultados: results });
}
