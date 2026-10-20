import { withApiKey, errBody } from "@/lib/api-http";
import { validateReconciliationBody } from "@/lib/api-payload";
import { auditRaw } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { persistReconciliation } from "@/lib/servicos/conciliacao";
import { reconciliationJson } from "@/lib/servicos/conciliacao-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cria uma conciliação a partir de títulos esperados + lançamentos (ou arquivo) do banco
export function POST(req: Request) {
  return withApiKey(req, "conciliacao:write", async ({ key, orgId, body, ip }) => {
    const cfg = await getSettings(orgId);
    const v = validateReconciliationBody(body, cfg.cnab400);
    if (!v.ok) return { status: 400, json: errBody("validation_error", "Corpo inválido.", v.errors) };
    const { rec, itemCount } = await persistReconciliation(orgId, v.value);
    await auditRaw(orgId, null, "api.conciliacao.criar", `chave ${key.prefix}: ${rec.name} (${rec.bankFormat}, ${itemCount} itens, regras ${JSON.stringify(v.value.options)})`, ip);
    return { status: 201, json: reconciliationJson(rec), resourceType: "Reconciliation", resourceId: rec.id };
  });
}

// Lista as conciliações da instituição, mais recentes primeiro
export function GET(req: Request) {
  return withApiKey(req, "conciliacao:read", async ({ orgId, params }) => {
    const limite = Math.min(100, Math.max(1, Number.parseInt(params.get("limite") ?? "20", 10) || 20));
    const pagina = Math.min(10_000, Math.max(1, Number.parseInt(params.get("pagina") ?? "1", 10) || 1));
    const [total, rows] = await Promise.all([
      db.reconciliation.count({ where: { orgId } }),
      db.reconciliation.findMany({ where: { orgId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (pagina - 1) * limite, take: limite }),
    ]);
    return { status: 200, json: { dados: rows.map(reconciliationJson), pagina, limite, total } };
  });
}
