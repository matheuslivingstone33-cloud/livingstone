// Consultas do assistente (COM banco). Toda consulta usa o orgId da sessão, recebido de quem chama; nunca da IA.
// Devolvem só o necessário para responder: sem CPF/CNPJ, telefone ou e-mail.
import { db } from "@/lib/db";
import { carregarPainel } from "@/lib/painel-dados";
import { fraseItem } from "@/lib/prova-conciliacao";
import { usageToday } from "@/lib/ai-meter";
import { getSettings } from "@/lib/settings";
import { diaSP } from "@/lib/tz";
import type { Entrada } from "@/lib/assistente";

const dia = (d: Date | null | undefined) => (d ? diaSP(d) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function executarConsulta(orgId: string, nome: string, e: Entrada, now: Date = new Date()): Promise<unknown> {
  if (nome === "consultar_painel") {
    const p = await carregarPainel(orgId, now);
    return {
      fatos: p.fatos,
      conciliacoes: p.recs,
      analisesCredito: p.credits,
      contratosPorSituacao: Object.fromEntries(p.debts.map((d) => [d.status, d._count])),
      pldObrigatorios: p.mandatory,
      regua: p.regua,
    };
  }
  if (nome === "buscar_contrato") {
    const termo = String(e.termo);
    const ds = await db.debt.findMany({
      where: { orgId, OR: [{ contract: { contains: termo, mode: "insensitive" } }, { debtor: { contains: termo, mode: "insensitive" } }] },
      orderBy: { dueDate: "asc" },
      take: 5,
      select: {
        id: true,
        contract: true,
        debtor: true,
        status: true,
        principal: true,
        dueDate: true,
        reguaPausedAt: true,
        reguaPauseReason: true,
        agreements: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, total: true, expiresAt: true } },
      },
    });
    return ds.map((d) => ({
      id: d.id,
      contrato: d.contract,
      devedor: d.debtor,
      situacao: d.status,
      valorOriginal: num(d.principal),
      vencimento: dia(d.dueDate),
      regua: d.reguaPausedAt ? `pausada (${d.reguaPauseReason ?? "pausa"})` : "ativa",
      ultimoAcordo: d.agreements[0] ? { situacao: d.agreements[0].status, total: num(d.agreements[0].total), validoAte: dia(d.agreements[0].expiresAt) } : null,
    }));
  }
  if (nome === "casos_pld_vencendo") {
    const dias = typeof e.dias === "number" ? e.dias : 7;
    const cs = await db.pldCase.findMany({
      where: { orgId, status: "EM_ANALISE", batch: { status: "CONCLUIDO" }, dueAt: { lte: new Date(now.getTime() + dias * 86_400_000) } },
      orderBy: { dueAt: "asc" },
      take: 10,
      select: { id: true, clientName: true, risk: true, mandatory: true, dueAt: true },
    });
    return cs.map((c) => ({ id: c.id, cliente: c.clientName, risco: c.risk, comunicacaoObrigatoria: c.mandatory, prazo: dia(c.dueAt), vencido: c.dueAt < now }));
  }
  if (nome === "resultado_conciliacao") {
    const r = await db.reconciliation.findFirst({
      where: { orgId, ...(typeof e.id === "string" ? { id: e.id } : {}) },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true, matched: true, divergent: true, missing: true, unexpected: true, manualCount: true, totalExpected: true, totalReceived: true },
    });
    if (!r) return { encontrada: false };
    const itens = await db.reconciliationItem.findMany({
      where: { reconciliationId: r.id, reconciliation: { orgId }, status: { in: ["DIVERGENTE", "PENDENTE", "NAO_ESPERADO"] } },
      take: 8,
      select: { reference: true, payer: true, expectedAmount: true, receivedAmount: true, paidAt: true, dueAt: true, status: true, originalStatus: true, rule: true },
    });
    return {
      encontrada: true,
      id: r.id,
      nome: r.name,
      data: dia(r.createdAt),
      pagos: r.matched,
      valorDiferente: r.divergent,
      naoChegou: r.missing,
      entrouSemCobranca: r.unexpected,
      resolvidosManualmente: r.manualCount,
      totalEsperado: num(r.totalExpected),
      totalRecebido: num(r.totalReceived),
      pendencias: itens.map((i) => fraseItem({ ...i, expectedAmount: num(i.expectedAmount), receivedAmount: num(i.receivedAmount) })),
    };
  }
  if (nome === "uso_ia_hoje") {
    const [u, cfg] = await Promise.all([usageToday(orgId, now), getSettings(orgId)]);
    return { gastoUsd: Math.round(u.spentUsd * 1e4) / 1e4, chamadas: u.calls, tetoUsd: cfg.ai.dailyLimitUsd, tetoChamadas: cfg.ai.dailyLimitCalls };
  }
  throw new Error("consulta desconhecida");
}
