// Cron diário (vercel.json): apaga registros de ApiRequest com mais de 24 h (idempotência e rate limit já expirados).
// A Vercel chama com Authorization: Bearer {CRON_SECRET}. Sem CRON_SECRET configurado, a rota fica fechada (401).
import { db } from "@/lib/db";
import { auditRaw } from "@/lib/auth";
import { cutoffApiRequests } from "@/lib/retencao";
import { cronAutorizado } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAutorizado(req.headers)) return new Response("Não autorizado", { status: 401 });

  const cutoff = cutoffApiRequests(new Date());
  const where = { createdAt: { lt: cutoff } };
  const porOrg = await db.apiRequest.groupBy({ by: ["orgId"], where, _count: { _all: true } });
  const { count } = await db.apiRequest.deleteMany({ where });
  // Auditoria só para organizações afetadas (auditRaw exige orgId); sem nada a apagar, só o log
  for (const g of porOrg)
    await auditRaw(g.orgId, null, "sistema.retencao_api", `Removidos ${g._count._all} registros de requisições da API anteriores a ${cutoff.toISOString()}.`);
  console.log(JSON.stringify({ evento: "cron.limpeza", removidos: count, organizacoes: porOrg.length, corte: cutoff.toISOString() }));
  return Response.json({ removidos: count, organizacoes: porOrg.length, corte: cutoff.toISOString() });
}
