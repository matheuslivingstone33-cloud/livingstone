import { audit, getSession } from "@/lib/auth";
import { db } from "@/lib/db";

// Neutraliza injeção de fórmula: no Excel, células iniciadas por = + - @ tab ou CR viram fórmulas executáveis
const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
const num = (v: unknown) => (v === null || v === undefined ? "" : Number(v).toFixed(2).replace(".", ","));

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new Response("Não autorizado", { status: 401 });
  const { id } = await params;
  const r = await db.reconciliation.findFirst({ where: { id, orgId: s.orgId }, include: { items: true } });
  if (!r) return new Response("Não encontrado", { status: 404 });

  const rows = [
    ["referencia", "pagador", "valor_esperado", "valor_recebido", "excedente", "vencimento", "pago_em", "status", "regra", "observacao"].join(";"),
    ...r.items.map((i) =>
      [
        cell(i.reference), cell(i.payer), num(i.expectedAmount), num(i.receivedAmount), num(i.excess),
        i.dueAt?.toISOString().slice(0, 10) ?? "", i.paidAt?.toISOString().slice(0, 10) ?? "", i.status, i.rule ?? "", cell(i.note),
      ].join(";"),
    ),
  ];
  await audit(s, "conciliacao.exportar", r.name);
  return new Response("﻿" + rows.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="conciliacao-${r.id}.csv"`,
      "cache-control": "no-store",
    },
  });
}
