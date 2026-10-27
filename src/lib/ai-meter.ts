// Medidor de consumo da IA (COM banco): só as server actions importam este arquivo.
// Antes de cada chamada, reserva o custo máximo sob trava por instituição e confere o teto diário
// (dia em Brasília); depois, grava o custo real. Nunca guarda prompt nem resposta.
import { db } from "./db";
import { aiProvider, claudeMessages, promptChars, tryClaudeJson, type AiCall, type AiFile, type AiOptions, type AiResult, type AiUsage, type MessagesCall, type MessagesResult } from "./ai";
import { checkBudget, estimateCost, modelFor, reserveCost, type AiTask } from "./ai-config";
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

/** Reserva sob trava por instituição e confere o teto diário. Grava a linha "reservada" ou "bloqueada_limite". */
async function reservar(orgId: string, userId: string | null, task: AiTask, model: string, reserve: number, clock: () => Date) {
  const limits = (await getSettings(orgId)).ai;
  return db.$transaction(async (tx) => {
    // Serializa a conferência do teto por instituição (chave própria, separada da trava da auditoria)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai:${orgId}`}))`;
    const cur = await usageToday(orgId, clock(), tx);
    const verdict = checkBudget({ ...cur, reserve }, limits);
    const status: UsageStatus = verdict === "ok" ? "reservada" : "bloqueada_limite";
    const row = await tx.aiUsage.create({ data: { orgId, userId, task, model, costUsd: verdict === "ok" ? reserve : 0, status }, select: { id: true } });
    return { verdict, id: row.id };
  });
}

/** Grava o custo real da chamada. Sem usage (rede, timeout): a reserva fica como custo, para o teto não subestimar. */
async function fechar(id: string, ok: boolean, usedModel: string, u: AiUsage | undefined) {
  await db.aiUsage
    .update({
      where: { id },
      data: {
        model: usedModel.slice(0, 80),
        status: ok ? "usada" : "falhou",
        ...(u ? { inputTokens: u.input, outputTokens: u.output, cacheTokens: u.cacheRead + u.cacheWrite, costUsd: estimateCost(usedModel, u) } : {}),
      },
    })
    .catch(() => undefined);
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
    const gate = await reservar(orgId, null, o.task, model, reserve, clock);
    if (gate.verdict !== "ok") return { ok: false, reason: "limite", detail: LIMIT_TEXT[gate.verdict] ?? "Teto de IA atingido", model, usageId: gate.id };

    let r: AiResult<T>;
    try {
      r = await inner<T>(system, prompt, files, o);
    } catch (e) {
      // tryClaudeJson não lança; uma função injetada pode lançar: vira falha, a reserva fica como custo
      r = { ok: false, reason: "http", detail: String((e as Error)?.message ?? e).slice(0, 300) };
    }
    await fechar(gate.id, r.ok, r.model ?? model, r.usage);
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

/**
 * Chamada de mensagens do assistente, medida por passo: mesma trava e mesmo teto diário da instituição,
 * com o usuário registrado na linha de consumo. Nunca guarda texto. `opts.call` substitui a chamada real.
 */
export function meteredMessages(orgId: string, userId: string, opts: { now?: () => Date; call?: MessagesCall; anexoTokens?: number } = {}): MessagesCall {
  const inner = opts.call ?? ((b) => claudeMessages(b));
  const clock = opts.now ?? (() => new Date());
  const extra = Math.max(0, opts.anexoTokens ?? 0);
  return async (body): Promise<MessagesResult> => {
    const model = modelFor("assistente");
    // Anexo PDF/imagem: o base64 não conta como texto; entra a estimativa de tokens do anexo (3 caracteres por token)
    const chars = extra ? JSON.stringify(body, (k, v) => (k === "data" && typeof v === "string" ? "" : v)).length : JSON.stringify(body).length;
    const reserve = reserveCost("assistente", chars + extra * 3);
    const gate = await reservar(orgId, userId, "assistente", model, reserve, clock);
    if (gate.verdict !== "ok") return { ok: false, reason: "limite", detail: LIMIT_TEXT[gate.verdict] ?? "Teto de IA atingido", model, usageId: gate.id };
    let r: MessagesResult;
    try {
      r = await inner(body);
    } catch (e) {
      r = { ok: false, reason: "http", detail: String((e as Error)?.message ?? e).slice(0, 300) };
    }
    await fechar(gate.id, r.ok, r.model ?? model, r.usage);
    return { ...r, usageId: gate.id };
  };
}
