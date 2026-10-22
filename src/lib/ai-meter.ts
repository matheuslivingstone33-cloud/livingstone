// Medidor de consumo da IA (COM banco): só as server actions importam este arquivo.
// Antes de cada chamada, reserva o custo máximo sob trava por instituição e confere o teto diário
// (dia em Brasília); depois, grava o custo real. Nunca guarda prompt nem resposta.
import { db } from "./db";
import { aiProvider, promptChars, tryClaudeJson, type AiCall, type AiFile, type AiOptions, type AiResult } from "./ai";
import { checkBudget, estimateCost, modelFor, reserveCost } from "./ai-config";
import { getSettings } from "./settings";
import { diaSP, inicioDoDiaSP } from "./tz";

export type UsageStatus = "reservada" | "usada" | "falhou" | "rejeitada" | "bloqueada_limite";

const LIMIT_TEXT: Record<string, string> = {
  limite_usd: "Teto diário de gasto com IA da instituição atingido",
  limite_chamadas: "Teto diário de chamadas de IA da instituição atingido",
  desligada: "IA desligada nas configurações da instituição (teto 0)",
};

/** Consumo do dia (Brasília) da instituição: custo somado (inclui reservas) e chamadas que foram à IA. */
export async function usageToday(orgId: string, now = new Date(), client: Pick<typeof db, "aiUsage"> = db) {
  const since = inicioDoDiaSP(diaSP(now));
  const [sum, calls] = await Promise.all([
    client.aiUsage.aggregate({ where: { orgId, createdAt: { gte: since } }, _sum: { costUsd: true } }),
    client.aiUsage.count({ where: { orgId, createdAt: { gte: since }, status: { not: "bloqueada_limite" } } }),
  ]);
  return { spentUsd: Number(sum._sum.costUsd ?? 0), calls };
}

/**
 * Função de IA medida para a instituição. `opts.call` substitui a chamada real (testes/integração).
 * Reprovada no teto: grava "bloqueada_limite" com custo 0 e devolve { ok: false, reason: "limite" } sem chamar a IA.
 */
export function meteredCall(orgId: string, opts: { now?: () => Date; call?: AiCall } = {}): AiCall {
  const inner = opts.call ?? tryClaudeJson;
  const clock = opts.now ?? (() => new Date());
  return async <T,>(system: string, prompt: string, files: AiFile[] | undefined, o: AiOptions<T>): Promise<AiResult<T>> => {
    const model = modelFor(o.task);
    const reserve = reserveCost(o.task, promptChars(system, prompt, files ?? []));
    const limits = (await getSettings(orgId)).ai;
    const gate = await db.$transaction(async (tx) => {
      // Serializa a conferência do teto por instituição (chave própria, separada da trava da auditoria)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai:${orgId}`}))`;
      const cur = await usageToday(orgId, clock(), tx);
      const verdict = checkBudget({ ...cur, reserve }, limits);
      if (verdict !== "ok") {
        const row = await tx.aiUsage.create({ data: { orgId, task: o.task, model, costUsd: 0, status: "bloqueada_limite" }, select: { id: true } });
        return { verdict, id: row.id };
      }
      const row = await tx.aiUsage.create({ data: { orgId, task: o.task, model, costUsd: reserve, status: "reservada" }, select: { id: true } });
      return { verdict, id: row.id };
    });
    if (gate.verdict !== "ok") return { ok: false, reason: "limite", detail: LIMIT_TEXT[gate.verdict] ?? "Teto de IA atingido", model, usageId: gate.id };

    let r: AiResult<T>;
    try {
      r = await inner<T>(system, prompt, files, o);
    } catch (e) {
      // tryClaudeJson não lança; uma função injetada pode lançar: vira falha, a reserva fica como custo
      r = { ok: false, reason: "http", detail: String((e as Error)?.message ?? e).slice(0, 300) };
    }
    const u = r.usage;
    const usedModel = r.model ?? model;
    await db.aiUsage
      .update({
        where: { id: gate.id },
        data: {
          model: usedModel.slice(0, 80),
          status: r.ok ? "usada" : "falhou",
          // Sem usage (rede, timeout): a reserva fica como custo, para o teto não subestimar
          ...(u
            ? { inputTokens: u.input, outputTokens: u.output, cacheTokens: u.cacheRead + u.cacheWrite, costUsd: estimateCost(usedModel, u) }
            : {}),
        },
      })
      .catch(() => undefined);
    return { ...r, usageId: gate.id };
  };
}

/** Função de IA para as actions: medida quando há chave; sem chave, nenhuma (os módulos seguem sem IA). */
export const aiCallFor = (orgId: string): AiCall | undefined => (aiProvider() === "claude" ? meteredCall(orgId) : undefined);

/** A conferência rejeitou o texto da IA: marca a linha (o custo continua contando). Filtra pela instituição. */
export async function markUsageRejected(orgId: string, usageId: string | undefined) {
  if (!usageId) return;
  await db.aiUsage.updateMany({ where: { id: usageId, orgId }, data: { status: "rejeitada" } }).catch(() => undefined);
}
