// Camada de IA: usa o Claude quando ANTHROPIC_API_KEY está definida;
// caso contrário, os módulos seguem sem a parte de IA (heurísticas locais).
// tryClaudeJson nunca lança: toda falha vira { ok: false, reason, detail } e o chamador cai no texto determinístico.
// Modelo, esforço, teto de saída e tempo vêm da tarefa (ai-config). Sem banco: o medidor de consumo fica em ai-meter.
import { TASKS, modelFor, type AiTask, type Usage } from "./ai-config";
import { UNTRUSTED_RULE, untrusted } from "./ai-prompt";

export type { AiTask } from "./ai-config";

export const aiProvider = () => (process.env.ANTHROPIC_API_KEY ? "claude" : "demo");

export type AiFile = { name: string; mime: string; data: Buffer };

export type AiUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type AiFailReason = "sem_chave" | "http" | "timeout" | "json" | "forma" | "recusa" | "truncado" | "limite";
type Meta = { usage?: AiUsage; model?: string; usageId?: string };
export type AiResult<T> = ({ ok: true; data: T } | { ok: false; reason: AiFailReason; detail: string }) & Meta;
export type AiOptions<T> = { task: AiTask; timeoutMs?: number; validate?: (x: unknown) => x is T };
/** Assinatura injetável nas libs (testes passam uma função falsa; produção usa o medidor ou tryClaudeJson). */
export type AiCall = <T>(system: string, prompt: string, files: AiFile[] | undefined, opts: AiOptions<T>) => Promise<AiResult<T>>;

const clip = (s: string) => {
  const key = process.env.ANTHROPIC_API_KEY;
  const clean = key ? s.split(key).join("[chave]") : s;
  return clean.replace(/sk-ant-[\w-]+/g, "[chave]").slice(0, 300);
};

function buildContent(prompt: string, files: AiFile[]) {
  const content: unknown[] = [];
  for (const f of files) {
    if (f.mime === "application/pdf")
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: f.data.toString("base64") },
        title: f.name.slice(0, 200),
      });
    else if (f.mime.startsWith("image/"))
      content.push({ type: "image", source: { type: "base64", media_type: f.mime, data: f.data.toString("base64") } });
    else content.push({ type: "text", text: untrusted("documento_do_cliente", `Arquivo: ${f.name.replace(/[<>"]/g, "").slice(0, 120)}\n${f.data.toString("utf8")}`) });
  }
  content.push({ type: "text", text: prompt });
  return content;
}

/** Tamanho aproximado da entrada em caracteres (para a reserva de custo). */
export const promptChars = (system: string, prompt: string, files: AiFile[] = []) =>
  system.length + prompt.length + files.reduce((a, f) => a + (f.mime === "application/pdf" || f.mime.startsWith("image/") ? f.data.length : f.data.toString("utf8").length), 0);

type ApiBody = {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
};

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const usageOf = (u: ApiBody["usage"]): AiUsage | undefined =>
  u ? { input: n(u.input_tokens), output: n(u.output_tokens), cacheRead: n(u.cache_read_input_tokens), cacheWrite: n(u.cache_creation_input_tokens) } : undefined;

/** Corpo da requisição de uma tarefa (exportado para teste). */
export function requestBody(task: AiTask, system: string, prompt: string, files: AiFile[] = []) {
  const t = TASKS[task];
  return {
    model: modelFor(task),
    max_tokens: t.max_tokens,
    output_config: { effort: t.effort },
    system: `${system}\n${UNTRUSTED_RULE}\nResponda SOMENTE com um objeto JSON válido, sem texto antes ou depois.`,
    messages: [{ role: "user", content: buildContent(prompt, files) }],
  };
}

export const tryClaudeJson: AiCall = async <T,>(system: string, prompt: string, files: AiFile[] = [], opts: AiOptions<T>): Promise<AiResult<T>> => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, reason: "sem_chave", detail: "ANTHROPIC_API_KEY não definida" };
  const timeoutMs = opts.timeoutMs ?? TASKS[opts.task].timeoutMs;
  const body = requestBody(opts.task, system, prompt, files ?? []);
  let model = body.model;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let text: string;
  let usage: AiUsage | undefined;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      signal: ctrl.signal,
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return { ok: false, reason: "http", detail: clip(`HTTP ${res.status}: ${b}`), model };
    }
    const raw = await res.text();
    let parsed: ApiBody;
    try {
      parsed = JSON.parse(raw) as ApiBody;
    } catch {
      return { ok: false, reason: "json", detail: clip(`Resposta da API não é JSON: ${raw}`), model };
    }
    usage = usageOf(parsed.usage);
    if (typeof parsed.model === "string") model = parsed.model.slice(0, 80);
    if (parsed.stop_reason === "refusal") return { ok: false, reason: "recusa", detail: "A IA recusou a tarefa", usage, model };
    if (parsed.stop_reason === "max_tokens") return { ok: false, reason: "truncado", detail: "Resposta da IA cortada no limite de tokens", usage, model };
    // Só blocos de texto: blocos de raciocínio ou outros tipos não entram no JSON
    text = (parsed.content ?? []).filter((c) => c?.type === "text").map((c) => c.text ?? "").join("");
  } catch (e) {
    const err = e as Error;
    if (ctrl.signal.aborted || err?.name === "AbortError") return { ok: false, reason: "timeout", detail: `Sem resposta em ${timeoutMs} ms`, model };
    return { ok: false, reason: "http", detail: clip(`Falha de rede: ${err?.message ?? String(e)}`), model };
  } finally {
    clearTimeout(timer);
  }
  let data: unknown;
  try {
    data = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return { ok: false, reason: "json", detail: clip(`Texto da IA não é JSON: ${text}`), usage, model };
  }
  try {
    if (opts.validate && !opts.validate(data)) return { ok: false, reason: "forma", detail: "Resposta da IA fora do formato esperado", usage, model };
  } catch (e) {
    return { ok: false, reason: "forma", detail: clip(`Validação falhou: ${(e as Error)?.message}`), usage, model };
  }
  return { ok: true, data: data as T, usage, model };
};

/** Função de IA a usar: a injetada (testes / medidor) ou a real, só quando há chave. */
export const pickAi = (call?: AiCall): AiCall | undefined => call ?? (aiProvider() === "claude" ? tryClaudeJson : undefined);

/** Metadados de consumo que as libs devolvem junto com o resultado. */
export const aiMeta = (r: Meta | undefined): Meta => (r ? { usage: r.usage, model: r.model, usageId: r.usageId } : {});

export type { Usage };
