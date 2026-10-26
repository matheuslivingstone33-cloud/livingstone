// Atualização do resumo do dia do painel (botão do painel ou plano confirmado do assistente). Mesmo comportamento da action original.
import { db } from "@/lib/db";
import { auditRaw } from "@/lib/auth";
import { aiCallFor, markUsageRejected } from "@/lib/ai-meter";
import { carregarPainel } from "@/lib/painel-dados";
import { fatosHash, gerarResumo } from "@/lib/resumo";
import { TASKS } from "@/lib/ai-config";
import type { Ator } from "@/lib/cobranca-proposta";

/** Trava do resumo: cobre o tempo máximo da IA com folga. */
export const RESUMO_LOCK_MS = TASKS.resumo.timeoutMs + 5_000;

export async function atualizarResumoServico(ator: Ator): Promise<"ok" | "travado"> {
  const orgId = ator.orgId;
  const audit = (action: string, detail: string) => auditRaw(orgId, ator.userId, action, detail, ator.ip);
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
  if (!lock.count) return "travado";

  try {
    const { fatos } = await carregarPainel(orgId, now);
    const r = await gerarResumo(fatos, { call: aiCallFor(orgId), now });
    await db.dailySummary.updateMany({
      where: { orgId },
      data: { text: r.texto, source: r.origem, factsHash: fatosHash(fatos), generatedAt: new Date(), lockUntil: null },
    });
    if (r.status === "rejeitada") {
      await markUsageRejected(orgId, r.usageId);
      await audit("ia.rejeitada", `Resumo do painel: ${r.motivo ?? ""}`.slice(0, 500));
    }
    if (r.status === "falhou") await audit("ia.falhou", `Resumo do painel: ${r.motivo ?? ""}`.slice(0, 500));
    if (r.status === "bloqueada_limite") await audit("ia.limite", "Resumo do painel: teto diário de IA atingido");
    // Só origem e motivo; o texto do resumo nunca vai para a auditoria
    await audit("resumo.gerado", `Origem: ${r.origem === "ia" ? "IA (conferida)" : "texto padrão"}${r.motivo ? ` · ${r.motivo}` : ""}`.slice(0, 500));
  } finally {
    await db.dailySummary.updateMany({ where: { orgId }, data: { lockUntil: null } }).catch(() => undefined);
  }
  return "ok";
}
