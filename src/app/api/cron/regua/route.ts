// Cron da régua de cobrança (vercel.json, dias úteis às 12:00 UTC = 9h em Brasília).
// A Vercel chama com Authorization: Bearer {CRON_SECRET}. Sem CRON_SECRET configurado, a rota fica fechada (401).
// Executa, em sequência, as instituições com a régua ligada, dentro de um orçamento de 45 s.
import { db } from "@/lib/db";
import { cronAutorizado } from "@/lib/cron-auth";
import { executarRegua } from "@/lib/regua-motor";
import { evolutionConfig, evolutionSender } from "@/lib/evolution";
import { WEBHOOK_BUDGET_MS, outOfBudget } from "@/lib/pix-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAutorizado(req.headers)) return new Response("Não autorizado", { status: 401 });

  const started = Date.now();
  const deadline = started + WEBHOOK_BUDGET_MS;
  const evo = evolutionConfig(process.env);
  const sender = evo ? evolutionSender(evo) : null;
  const orgs = await db.organization.findMany({ where: { settings: { path: ["regua", "ativa"], equals: true } }, select: { id: true }, orderBy: { createdAt: "asc" } });

  const r = { organizacoes: orgs.length, executadas: 0, enviados: 0, falhas: 0, emAndamento: 0, semTempo: 0, erros: 0 };
  for (const o of orgs) {
    if (outOfBudget(started, Date.now())) {
      r.semTempo++;
      continue;
    }
    try {
      const x = await executarRegua(o.id, { orgId: o.id, userId: null, nome: "Régua automática" }, sender, new Date(), deadline);
      if (!x.ok) {
        if (x.motivo === "em_andamento") r.emAndamento++;
        continue;
      }
      r.executadas++;
      r.enviados += x.totais.enviados;
      r.falhas += x.totais.falhas;
    } catch {
      r.erros++;
    }
  }
  console.log(JSON.stringify({ evento: "cron.regua", canal: sender ? "whatsapp" : "desligado", ...r }));
  return Response.json({ canal: sender ? "whatsapp" : "desligado", ...r });
}
