"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireSession } from "@/lib/auth";
import { aiCallFor, markUsageRejected } from "@/lib/ai-meter";
import { carregarPainel } from "@/lib/painel-dados";
import { fatosHash, gerarResumo } from "@/lib/resumo";
import { TASKS } from "@/lib/ai-config";
import { fail } from "@/lib/errors";

/** Trava do resumo: cobre o tempo máximo da IA com folga. */
const RESUMO_LOCK_MS = TASKS.resumo.timeoutMs + 5_000;

// Atualiza o resumo do dia do painel. Só quem opera; o auditor vê o último resumo salvo.
export async function atualizarResumo() {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const orgId = s.orgId;
  const now = new Date();
  await db.dailySummary.upsert({
    where: { orgId },
    create: { orgId, text: "", source: "base", factsHash: "", generatedAt: new Date(0) },
    update: {},
  });
  // Uma atualização por vez na instituição
  const lock = await db.dailySummary.updateMany({
    where: { orgId, OR: [{ lockUntil: null }, { lockUntil: { lt: now } }] },
    data: { lockUntil: new Date(now.getTime() + RESUMO_LOCK_MS) },
  });
  if (!lock.count) fail("/dashboard", "O resumo já está sendo atualizado. Aguarde alguns segundos e recarregue a página.");

  try {
    const { fatos } = await carregarPainel(orgId, now);
    const r = await gerarResumo(fatos, { call: aiCallFor(orgId), now });
    await db.dailySummary.updateMany({
      where: { orgId },
      data: { text: r.texto, source: r.origem, factsHash: fatosHash(fatos), generatedAt: new Date(), lockUntil: null },
    });
    if (r.status === "rejeitada") {
      await markUsageRejected(orgId, r.usageId);
      await audit(s, "ia.rejeitada", `Resumo do painel: ${r.motivo ?? ""}`.slice(0, 500));
    }
    if (r.status === "falhou") await audit(s, "ia.falhou", `Resumo do painel: ${r.motivo ?? ""}`.slice(0, 500));
    if (r.status === "bloqueada_limite") await audit(s, "ia.limite", "Resumo do painel: teto diário de IA atingido");
    // Só origem e motivo; o texto do resumo nunca vai para a auditoria
    await audit(s, "resumo.gerado", `Origem: ${r.origem === "ia" ? "IA (conferida)" : "texto padrão"}${r.motivo ? ` · ${r.motivo}` : ""}`.slice(0, 500));
  } finally {
    await db.dailySummary.updateMany({ where: { orgId }, data: { lockUntil: null } }).catch(() => undefined);
  }
  revalidatePath("/dashboard");
}
