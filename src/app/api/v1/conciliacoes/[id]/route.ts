import { withApiKey, errBody } from "@/lib/api-http";
import { db } from "@/lib/db";
import { itemJson, reconciliationJson } from "@/lib/servicos/conciliacao-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Detalhe com os itens. Outra instituição ou id inexistente: o mesmo 404.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiKey(req, "conciliacao:read", async ({ orgId }) => {
    const rec = await db.reconciliation.findFirst({ where: { id: id.slice(0, 64), orgId }, include: { items: { orderBy: { id: "asc" } } } });
    if (!rec) return { status: 404, json: errBody("not_found", "Conciliação não encontrada.") };
    return { status: 200, json: { ...reconciliationJson(rec), itens: rec.items.map(itemJson) }, resourceType: "Reconciliation", resourceId: rec.id };
  });
}
