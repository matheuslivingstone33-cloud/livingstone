// Cron diário (vercel.json): apaga registros de ApiRequest com mais de 24 h (idempotência e rate limit já expirados)
// e conversas do assistente (AssistantMessageLog) com mais de 180 dias.
// A Vercel chama com Authorization: Bearer {CRON_SECRET}. Sem CRON_SECRET configurado, a rota fica fechada (401).
import { db } from "@/lib/db";
import { auditRaw } from "@/lib/auth";
import { cutoffApiRequests, cutoffConversas } from "@/lib/retencao";
import { cronAutorizado } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAutorizado(req.headers)) return new Response("Não autorizado", { status: 401 });

  const now = new Date();
  const cutoff = cutoffApiRequests(now);
  const where = { createdAt: { lt: cutoff } };
  const porOrg = await db.apiRequest.groupBy({ by: ["orgId"], where, _count: { _all: true } });
  const { count } = await db.apiRequest.deleteMany({ where });
  // Auditoria só para organizações afetadas (auditRaw exige orgId); sem nada a apagar, só o log
  for (const g of porOrg)
    await auditRaw(g.orgId, null, "sistema.retencao_api", `Removidos ${g._count._all} registros de requisições da API anteriores a ${cutoff.toISOString()}.`);

  const corteConversas = cutoffConversas(now);
  const whereConversas = { createdAt: { lt: corteConversas } };
  const conversasPorOrg = await db.assistantMessageLog.groupBy({ by: ["orgId"], where: whereConversas, _count: { _all: true } });
  const conversas = await db.assistantMessageLog.deleteMany({ where: whereConversas });
  for (const g of conversasPorOrg)
    await auditRaw(g.orgId, null, "sistema.retencao_conversas", `Removidas ${g._count._all} mensagens do assistente anteriores a ${corteConversas.toISOString()}.`);

  console.log(
    JSON.stringify({ evento: "cron.limpeza", removidos: count, organizacoes: porOrg.length, corte: cutoff.toISOString(), conversasRemovidas: conversas.count, corteConversas: corteConversas.toISOString() }),
  );
  return Response.json({ removidos: count, organizacoes: porOrg.length, corte: cutoff.toISOString(), conversasRemovidas: conversas.count, corteConversas: corteConversas.toISOString() });
}
