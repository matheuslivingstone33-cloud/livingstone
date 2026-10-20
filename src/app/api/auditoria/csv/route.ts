import { audit, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditWhere, filtersSummary, parseAuditFilters } from "@/lib/audit-chain";
import { cell, csvDocument } from "@/lib/csv";

// Tempo máximo da função na Vercel (actions e exportações longas)
export const maxDuration = 60;

const MAX_ROWS = 50_000;

// Exporta a trilha com os mesmos filtros da tela; sempre restrita à organização da sessão
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return new Response("Não autorizado", { status: 401 });
  if (!["ADMIN", "AUDITOR"].includes(s.role)) return new Response("Sem permissão", { status: 403 });
  const f = parseAuditFilters(new URL(req.url).searchParams);
  const rows = await db.auditLog.findMany({
    where: auditWhere(s.orgId, f),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_ROWS,
    select: { seq: true, createdAt: true, action: true, detail: true, ip: true, hash: true, user: { select: { name: true } } },
  });
  await audit(s, "auditoria.exportar", `${rows.length} registro(s)${rows.length === MAX_ROWS ? " (limite atingido)" : ""}; ${filtersSummary(f)}`);
  const body = csvDocument(
    ["seq", "data", "usuario", "acao", "detalhe", "ip", "hash"],
    rows.map((r) => [r.seq?.toString() ?? "", r.createdAt.toISOString(), cell(r.user?.name ?? "Sistema / devedor"), cell(r.action), cell(r.detail), cell(r.ip), r.hash ?? ""]),
  );
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="auditoria-${s.orgId}.csv"`,
      "cache-control": "no-store",
    },
  });
}
