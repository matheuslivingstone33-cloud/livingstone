// Consultas do painel (COM banco): usadas pela página e pela action do resumo do dia.
// Toda consulta filtra pela instituição.
import { db } from "./db";
import { ACORDO_VENCENDO_MS, montarFatos, type ResumoFatos } from "./resumo";

export async function carregarPainel(orgId: string, now: Date = new Date()) {
  const where = { orgId };
  const emAnalise = { ...where, batch: { status: "CONCLUIDO" }, status: "EM_ANALISE" };
  const [recs, credits, recAgg, decisions, payments, debts, pldOpen, pldByRisk, recent, mandatory, pldAbertos, acordosPropostos] = await Promise.all([
    db.reconciliation.count({ where }),
    db.creditAnalysis.count({ where }),
    db.reconciliation.aggregate({ where, _sum: { totalReceived: true, divergent: true, missing: true } }),
    db.creditAnalysis.groupBy({ by: ["decision"], where, _count: true }),
    db.payment.findMany({ where: { agreement: { debt: where } }, select: { amount: true, paidAt: true } }),
    db.debt.groupBy({ by: ["status"], where, _count: true, _sum: { principal: true } }),
    db.pldCase.findMany({ where: emAnalise, orderBy: { dueAt: "asc" }, take: 4 }),
    db.pldCase.groupBy({ by: ["risk"], where: emAnalise, _count: true }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 7, include: { user: true } }),
    db.pldCase.count({ where: { ...emAnalise, mandatory: true } }),
    db.pldCase.findMany({ where: emAnalise, select: { dueAt: true, mandatory: true } }),
    db.agreement.findMany({
      where: { status: "PROPOSTO", debt: where, expiresAt: { gte: now, lte: new Date(now.getTime() + ACORDO_VENCENDO_MS) } },
      select: { expiresAt: true },
    }),
  ]);

  const problems = (recAgg._sum.divergent ?? 0) + (recAgg._sum.missing ?? 0);
  const openDebt = debts.filter((d) => d.status !== "QUITADO").reduce((a, d) => a + Number(d._sum.principal ?? 0), 0);
  const fatos: ResumoFatos = montarFatos({ pldAbertos, acordosPropostos, conciliacaoProblemas: problems, dividaAberta: openDebt, pagamentos: payments }, now);

  return { recs, credits, recAgg, decisions, payments, debts, pldOpen, pldByRisk, recent, mandatory, problems, openDebt, fatos };
}
