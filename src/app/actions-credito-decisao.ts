"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireSession } from "@/lib/auth";
import { validarDecisao } from "@/lib/credito-decisao";

export type DecisaoState = { error?: string; ok?: string };

export async function decidirCredito(id: string, _prev: DecisaoState, form: FormData): Promise<DecisaoState> {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const c = await db.creditAnalysis.findFirst({ where: { id, orgId: s.orgId } });
  if (!c) return { error: "Análise não encontrada." };
  const v = validarDecisao({ atual: c.finalDecision, nova: form.get("decision"), justificativa: form.get("justification"), role: s.role });
  if (!v.ok) return { error: v.error };

  const agora = new Date();
  const ok = await db.$transaction(async (tx) => {
    // Condicional: duas decisões simultâneas não sobrescrevem uma à outra
    const where = v.revisao
      ? { id: c.id, orgId: s.orgId, finalDecision: c.finalDecision, decidedAt: c.decidedAt }
      : { id: c.id, orgId: s.orgId, finalDecision: null };
    const { count } = await tx.creditAnalysis.updateMany({
      where,
      data: { finalDecision: v.decisao, justification: v.justificativa, decidedById: s.userId, decidedByName: s.name, decidedAt: agora },
    });
    if (!count) return false;
    await tx.creditDecisionEvent.create({
      data: { orgId: s.orgId, analysisId: c.id, fromDecision: c.finalDecision, toDecision: v.decisao, justification: v.justificativa, userId: s.userId, userName: s.name, createdAt: agora },
    });
    return true;
  });
  if (!ok) return { error: "Esta análise acabou de ser decidida por outra pessoa. Recarregue a página." };
  await audit(s, v.revisao ? "credito.revisar_decisao" : "credito.decidir", `${s.name} · ${c.applicant} · ${c.finalDecision ? `${c.finalDecision} → ` : ""}${v.decisao} · ${v.justificativa.slice(0, 200)}`);
  revalidatePath(`/credito/${c.id}`);
  revalidatePath("/credito");
  return { ok: v.revisao ? "Decisão revisada." : "Decisão registrada." };
}
