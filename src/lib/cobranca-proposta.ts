// Geração da proposta de um contrato (COM banco; só no servidor). Usada pelo clique, pelo lote e pela régua.
// Grava a proposta e audita a IA quando ela foi rejeitada, falhou ou foi barrada pelo teto (só contrato e motivo, nunca o texto).
import { db } from "./db";
import { auditRaw } from "./auth";
import { proposal, type AiStatus } from "./collection";
import { aiCallFor, markUsageRejected } from "./ai-meter";
import { getSettings } from "./settings";
import { appUrl, newAgreementToken } from "./payments";
import { PROPOSAL_DEDUP_MS } from "./idempotencia";

/** Quem pediu: um usuário (com IP da requisição) ou o sistema (userId null, ex.: régua automática). */
export type Ator = { orgId: string; userId: string | null; nome: string; ip?: string | null };

export type ProposalOutcome = { created: false; reason: "fechado" | "recente" } | { created: true; aiStatus: AiStatus };
export type ProposalAi = { useAi?: boolean; timeoutMs?: number };

export async function createProposal(ator: Ator, debtId: string, ai: ProposalAi = {}): Promise<ProposalOutcome> {
  const orgId = ator.orgId;
  const d = await db.debt.findFirstOrThrow({ where: { id: debtId, orgId } });
  if (d.status === "ACORDO" || d.status === "QUITADO") return { created: false, reason: "fechado" };
  // Trava curta e atômica antes da IA: um segundo clique (ou o lote) no mesmo contrato não gera outra proposta
  const now = new Date();
  const lock = await db.debt.updateMany({
    where: { id: debtId, orgId, OR: [{ proposalLockUntil: null }, { proposalLockUntil: { lt: now } }] },
    data: { proposalLockUntil: new Date(now.getTime() + PROPOSAL_DEDUP_MS) },
  });
  if (!lock.count) return { created: false, reason: "recente" };
  const cfg = await getSettings(orgId);
  const token = newAgreementToken();
  const useAi = ai.useAi !== false;
  const p = await proposal({ ...d, principal: Number(d.principal) }, `${appUrl()}/acordo/${token}`, cfg.collection, cfg.pix.merchant, {
    useAi,
    call: useAi ? aiCallFor(orgId) : undefined,
    timeoutMs: ai.timeoutMs,
  });
  const rec = p.options[p.recommended];
  await db.$transaction([
    // Uma proposta ativa por contrato: as anteriores em aberto são canceladas
    db.agreement.updateMany({ where: { debtId, status: "PROPOSTO", debt: { orgId } }, data: { status: "CANCELADO" } }),
    db.agreement.create({
      data: {
        debtId,
        token,
        daysLate: p.days,
        updatedDebt: p.total,
        discountPct: rec.discountPct,
        total: rec.total,
        installments: rec.installments,
        installment: rec.installment,
        options: p.options,
        message: p.message,
        messageBase: p.messageBase,
        aiStatus: p.aiStatus,
        aiProvider: p.provider,
        expiresAt: new Date(Date.now() + cfg.collection.validityDays * 86_400_000),
      },
    }),
    db.debt.updateMany({ where: { id: debtId, orgId }, data: { status: "NEGOCIANDO" } }),
  ]);
  if (p.aiStatus === "rejeitada") {
    await markUsageRejected(orgId, p.usageId);
    await auditRaw(orgId, ator.userId, "ia.rejeitada", `Cobrança, contrato ${d.contract}: ${p.missing.join("; ")}`.slice(0, 500), ator.ip);
  }
  if (p.aiStatus === "falhou") await auditRaw(orgId, ator.userId, "ia.falhou", `Cobrança, contrato ${d.contract}: ${p.aiDetail ?? ""}`.slice(0, 500), ator.ip);
  return { created: true, aiStatus: p.aiStatus };
}
