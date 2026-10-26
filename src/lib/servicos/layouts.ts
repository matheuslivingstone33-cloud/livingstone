// Layouts de planilha salvos pela instituição (usados pela API; a tela consulta um por vez).
import { db } from "@/lib/db";
import { validateLayout, type Layout } from "@/lib/layout-conciliacao";

/** Layouts da instituição por assinatura do cabeçalho; os que não passam de novo na validação ficam de fora. */
export async function carregarLayouts(orgId: string): Promise<Map<string, Layout>> {
  const rows = await db.reconLayout.findMany({ where: { orgId }, select: { assinatura: true, cabecalho: true, layout: true }, take: 500 });
  const out = new Map<string, Layout>();
  for (const r of rows) {
    const header = Array.isArray(r.cabecalho) ? r.cabecalho.filter((h): h is string => typeof h === "string") : [];
    const v = validateLayout(r.layout, header);
    if (v.ok) out.set(r.assinatura, v.layout);
  }
  return out;
}
