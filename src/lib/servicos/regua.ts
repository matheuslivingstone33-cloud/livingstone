// Pausa da régua de um contrato (tela do contrato ou plano confirmado do assistente). Mesmo comportamento da action original.
import { db } from "@/lib/db";
import { auditRaw } from "@/lib/auth";
import type { Ator } from "@/lib/cobranca-proposta";

const MOTIVOS = { pausa: "pausa", opt_out: "opt_out" } as const;
export type MotivoPausa = (typeof MOTIVOS)[keyof typeof MOTIVOS];

/** Motivo aceito ou null. Puro. */
export const motivoPausa = (m: string): MotivoPausa | null => (Object.prototype.hasOwnProperty.call(MOTIVOS, m) ? MOTIVOS[m as keyof typeof MOTIVOS] : null);

/** Texto da auditoria da pausa. Puro. */
export const textoPausa = (contract: string, m: MotivoPausa) => `Contrato ${contract}: ${m === "opt_out" ? "devedor pediu para não receber mensagens" : "régua pausada"}`;

export type PausaResultado = { ok: false; erro: "motivo" | "nao_encontrado" } | { ok: true; contract: string };

export async function pausarReguaServico(ator: Ator, debtId: string, motivo: string): Promise<PausaResultado> {
  const m = motivoPausa(motivo);
  if (!m) return { ok: false, erro: "motivo" };
  const d = await db.debt.findFirst({ where: { id: debtId, orgId: ator.orgId }, select: { id: true, contract: true } });
  if (!d) return { ok: false, erro: "nao_encontrado" };
  await db.debt.updateMany({ where: { id: d.id, orgId: ator.orgId }, data: { reguaPausedAt: new Date(), reguaPauseReason: m, reguaPausedBy: ator.nome.slice(0, 120) } });
  await auditRaw(ator.orgId, ator.userId, "cobranca.regua.pausa", textoPausa(d.contract, m), ator.ip);
  return { ok: true, contract: d.contract };
}
