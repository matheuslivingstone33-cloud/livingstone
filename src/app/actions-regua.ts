"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, clientIp, requireSession } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { executarRegua } from "@/lib/regua-motor";
import { evolutionConfig, evolutionSender } from "@/lib/evolution";
import { WEBHOOK_BUDGET_MS } from "@/lib/pix-webhook";

const MOTIVOS = { pausa: "pausa", opt_out: "opt_out" } as const;

/** Pausa a régua de um contrato. opt_out: o devedor pediu para não receber mensagens. */
export async function pausarRegua(debtId: string, motivo: string) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const back = `/cobranca/${debtId}`;
  const m = MOTIVOS[motivo as keyof typeof MOTIVOS];
  if (!m) fail(back, "Motivo inválido.");
  const d = await db.debt.findFirst({ where: { id: debtId, orgId: s.orgId }, select: { id: true, contract: true } });
  if (!d) fail("/cobranca", "Contrato não encontrado.");
  await db.debt.updateMany({ where: { id: d.id, orgId: s.orgId }, data: { reguaPausedAt: new Date(), reguaPauseReason: m, reguaPausedBy: s.name.slice(0, 120) } });
  await audit(s, "cobranca.regua.pausa", `Contrato ${d.contract}: ${m === "opt_out" ? "devedor pediu para não receber mensagens" : "régua pausada"}`);
  revalidatePath(back);
  revalidatePath("/cobranca");
}

export async function retomarRegua(debtId: string) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const d = await db.debt.findFirst({ where: { id: debtId, orgId: s.orgId }, select: { id: true, contract: true, reguaPausedAt: true } });
  if (!d) fail("/cobranca", "Contrato não encontrado.");
  if (!d.reguaPausedAt) return;
  await db.debt.updateMany({ where: { id: d.id, orgId: s.orgId }, data: { reguaPausedAt: null, reguaPauseReason: null, reguaPausedBy: null } });
  await audit(s, "cobranca.regua.retomar", `Contrato ${d.contract}: régua retomada`);
  revalidatePath(`/cobranca/${debtId}`);
  revalidatePath("/cobranca");
}

export async function executarReguaAgora() {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const evo = evolutionConfig(process.env);
  const r = await executarRegua(
    s.orgId,
    { orgId: s.orgId, userId: s.userId, nome: s.name, ip: await clientIp() },
    evo ? evolutionSender(evo) : null,
    new Date(),
    Date.now() + WEBHOOK_BUDGET_MS,
  );
  if (!r.ok)
    fail("/cobranca", r.motivo === "desligada" ? "A régua está desligada. Ligue em Configurações > Régua de cobrança." : "Já há uma execução da régua em andamento. Aguarde ela terminar.");
  revalidatePath("/cobranca");
  const t = r.totais;
  redirect(`/cobranca?regua=1&r_env=${t.enviados}&r_prop=${t.propostas}&r_falhas=${t.falhas + t.erros}&r_rest=${t.restantes ? 1 : 0}#regua`);
}
