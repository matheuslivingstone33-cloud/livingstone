import { audit, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { arvoreSalva, mapaDeClasses, moedaUnica, pendentesDoAno, prepararPeriodos, type Registro } from "@/lib/consolidado";
import type { Linhas } from "@/lib/demonstrativos";
import { classificar } from "@/lib/plano-contas";
import { montarPlanilhaConsolidada } from "@/lib/xlsx";

export const maxDuration = 60;

/** Planilha do ano com os meses CONFERIDO da org (qualquer perfil, inclusive AUDITOR). */
export async function GET(_: Request, { params }: { params: Promise<{ ano: string }> }) {
  const s = await requireSession();
  const { ano: a } = await params;
  const ano = Number(a);
  if (!/^\d{4}$/.test(a) || ano < 2000 || ano > 2100) return new Response("Ano inválido", { status: 400 });

  const rows = await db.demonstrativoPeriodo.findMany({
    where: { orgId: s.orgId, status: "CONFERIDO", OR: [{ ano }, { ano: ano - 1, mes: 12 }] },
    orderBy: [{ ano: "asc" }, { mes: "asc" }],
    select: { ano: true, mes: true, status: true, moeda: true, linhas: true, contas: true },
  });
  const doAno = rows.filter((r) => r.ano === ano);
  const moeda = moedaUnica(doAno);
  if (moeda === null) return new Response("Nenhum mês conferido neste ano.", { status: 404 });
  if (moeda === "mista") return new Response("Os meses conferidos estão em moedas diferentes; a planilha não mistura moedas.", { status: 409 });

  const mapa = mapaDeClasses(await db.classificacaoConta.findMany({ where: { orgId: s.orgId }, select: { conta: true, classe: true } }));
  const registros: Registro[] = rows
    .filter((r) => r.moeda === moeda)
    .map((r) => ({ ano: r.ano, mes: r.mes, status: r.status, linhas: (r.linhas ?? {}) as Linhas, contas: arvoreSalva(r.contas) }));
  const periodos = prepararPeriodos(registros, mapa);
  const ultima = [...registros].reverse().find((r) => r.ano === ano && r.contas)?.contas ?? null;
  const buf = montarPlanilhaConsolidada(ano, periodos, {
    moeda,
    pendentesClassificacao: pendentesDoAno(ano, periodos),
    contas: ultima ? { arvore: ultima, classes: classificar(ultima, mapa).classes } : undefined,
  });

  await audit(s, "demonstrativo.exportado", `${ano} · ${doAno.length} meses`);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="consolidado-${ano}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
