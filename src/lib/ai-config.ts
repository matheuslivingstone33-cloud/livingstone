// Configuração da IA por tarefa, preços e teto de consumo. Puro: sem banco, sem Next, sem rede.

export type AiTask = "cobranca" | "pld" | "credito" | "legado";
export type AiEffort = "low" | "medium" | "high";
export type TaskConfig = { model: string; effort: AiEffort; max_tokens: number; timeoutMs: number };

/** Modelo, esforço, teto de saída e tempo máximo de cada tarefa. */
export const TASKS: Record<AiTask, TaskConfig> = {
  cobranca: { model: "claude-haiku-5-5", effort: "low", max_tokens: 1024, timeoutMs: 15_000 },
  pld: { model: "claude-haiku-5-5", effort: "low", max_tokens: 4096, timeoutMs: 40_000 },
  credito: { model: "claude-haiku-5-5", effort: "low", max_tokens: 4096, timeoutMs: 45_000 },
  legado: { model: "claude-sonnet-5-5", effort: "medium", max_tokens: 6000, timeoutMs: 50_000 },
};

const OVERRIDE: Record<AiTask, string> = { cobranca: "AI_MODEL_COBRANCA", pld: "AI_MODEL_PLD", credito: "AI_MODEL_CREDITO", legado: "AI_MODEL_LEGADO" };
const MODEL_RE = /^claude-[a-z0-9-]+$/;

/** Modelo da tarefa: AI_MODEL_<TAREFA> só vale se tiver forma de id de modelo Claude. ANTHROPIC_MODEL é ignorada. */
export function modelFor(task: AiTask, env: Record<string, string | undefined> = process.env): string {
  const v = env[OVERRIDE[task]]?.trim();
  return v && MODEL_RE.test(v) ? v : TASKS[task].model;
}

/** Preço em USD por 1 milhão de tokens. */
type Price = { input: number; output: number };
const OPUS: Price = { input: 4, output: 20 };
const HAIKU_LOW: Price = { input: 0.1, output: 0.5 };
const HAIKU_HIGH: Price = { input: 0.5, output: 2.5 };
/** Acima deste total de entrada (incluindo cache), o Haiku cobra a faixa alta. */
export const HAIKU_TIER_TOKENS = 100_000;

export function priceOf(model: string, inputTotal = 0): Price {
  if (model.startsWith("claude-haiku-5-5")) return inputTotal > HAIKU_TIER_TOKENS ? HAIKU_HIGH : HAIKU_LOW;
  if (model.startsWith("claude-sonnet-5-5")) return { input: 2, output: 10 };
  if (model.startsWith("claude-opus-5-5")) return OPUS;
  // Desconhecido: cobra como o mais caro, para o teto nunca subestimar
  return OPUS;
}

export type Usage = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Custo em USD. Tokens de cache contam a preço cheio de entrada (estimativa conservadora). */
export function estimateCost(model: string, u: Usage): number {
  const input = Math.max(0, u.input || 0) + Math.max(0, u.cacheRead || 0) + Math.max(0, u.cacheWrite || 0);
  const output = Math.max(0, u.output || 0);
  const p = priceOf(model, input);
  return round6((input * p.input + output * p.output) / 1e6);
}

/** Reserva antes da chamada: entrada estimada (3 caracteres por token) + teto de saída da tarefa. */
export function reserveCost(task: AiTask, promptChars: number, env: Record<string, string | undefined> = process.env): number {
  const input = Math.ceil(Math.max(0, promptChars) / 3);
  return estimateCost(modelFor(task, env), { input, output: TASKS[task].max_tokens });
}

export type BudgetLimits = { dailyLimitUsd: number; dailyLimitCalls: number };
export type BudgetVerdict = "ok" | "limite_usd" | "limite_chamadas" | "desligada";

/** Teto diário da instituição. Limite 0 desliga a IA. */
export function checkBudget(cur: { spentUsd: number; calls: number; reserve: number }, lim: BudgetLimits): BudgetVerdict {
  if (!(lim.dailyLimitUsd > 0) || !(lim.dailyLimitCalls > 0)) return "desligada";
  // Arredonda para micro-dólar: evita que ruído de ponto flutuante reprove quem está exatamente no limite
  if (round6(cur.spentUsd + cur.reserve) > lim.dailyLimitUsd) return "limite_usd";
  if (cur.calls >= lim.dailyLimitCalls) return "limite_chamadas";
  return "ok";
}
