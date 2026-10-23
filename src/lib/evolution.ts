// Envio de WhatsApp pela Evolution API. Puro: o fetch é injetado e a configuração vem do objeto de ambiente recebido.
// Nunca registra a chave, o número nem o corpo da mensagem (nem em erros).
import type { ResultadoEnvio, Sender } from "./canal";

export type EvolutionCfg = { url: string; apiKey: string; instance: string };
export const EVOLUTION_TIMEOUT_MS = 8000;

/** Configuração da Evolution a partir do ambiente. null se faltar algo ou se a URL não for https. */
export function evolutionConfig(env: Record<string, string | undefined>): EvolutionCfg | null {
  const url = (env.EVOLUTION_API_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (env.EVOLUTION_API_KEY ?? "").trim();
  const instance = (env.EVOLUTION_INSTANCE ?? "").trim();
  if (!url || !apiKey || !instance) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url, apiKey, instance };
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function evolutionSender(cfg: EvolutionCfg, fetchFn: FetchLike = fetch, timeoutMs = EVOLUTION_TIMEOUT_MS): Sender {
  return {
    canal: "whatsapp",
    async enviar(numero: string, texto: string): Promise<ResultadoEnvio> {
      let res: Response;
      try {
        res = await fetchFn(`${cfg.url}/message/sendText/${encodeURIComponent(cfg.instance)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
          body: JSON.stringify({ number: numero, text: texto }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        // A mensagem do erro pode carregar a URL ou dados do pedido: só o tipo sai daqui
        const nome = e instanceof Error ? e.name : "";
        return { ok: false, motivo: nome === "TimeoutError" || nome === "AbortError" ? "timeout" : "rede", transitorio: true };
      }
      if (res.status >= 200 && res.status < 300) {
        const body = (await res.json().catch(() => null)) as { key?: { id?: unknown } } | null;
        const id = body?.key?.id;
        return { ok: true, providerId: typeof id === "string" ? id.slice(0, 100) : undefined };
      }
      return { ok: false, motivo: `http_${res.status}`, transitorio: res.status >= 500 || res.status === 429 };
    },
  };
}
