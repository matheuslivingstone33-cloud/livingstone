// Chaves da API pública: geração, hash e conferência. Puro (só node:crypto): sem banco nem Next.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Escopos por módulo. Nesta versão só conciliação está implementada; os demais já ficam reservados. */
export type ApiScope = "conciliacao:write" | "conciliacao:read" | "cobranca:write" | "pld:write" | "pld:read";
export const ALL_SCOPES: readonly ApiScope[] = ["conciliacao:write", "conciliacao:read", "cobranca:write", "pld:write", "pld:read"];
/** Escopos que a tela permite marcar hoje */
export const AVAILABLE_SCOPES: readonly ApiScope[] = ["conciliacao:write", "conciliacao:read"];

export const KEY_PREFIX = "fo_live_";
const SECRET_RE = /^fo_live_([a-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

export const hashKey = (secret: string) => createHash("sha256").update(secret, "utf8").digest("hex");

/** Gera uma chave nova. O segredo só existe no retorno: guarde apenas prefix e hash. */
export function generateKey() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const prefix = Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
  const secret = `${KEY_PREFIX}${prefix}_${randomBytes(32).toString("base64url")}`;
  return { secret, prefix, hash: hashKey(secret) };
}

/** Extrai e valida o formato do segredo do header Authorization. Nunca lança. */
export function parseBearer(header: string | null | undefined): { secret: string; prefix: string } | null {
  if (typeof header !== "string" || header.length > 200) return null;
  const m = header.trim().match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const k = m[1].match(SECRET_RE);
  return k ? { secret: m[1], prefix: k[1] } : null;
}

/** Comparação em tempo constante de dois hex; tamanhos diferentes ou entrada inválida → false. */
export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || !/^[0-9a-f]*$/i.test(a) || !/^[0-9a-f]*$/i.test(b)) return false;
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const hasScope = (scopes: readonly string[], needed: ApiScope) => scopes.includes(needed);

export const isScope = (s: string): s is ApiScope => (ALL_SCOPES as readonly string[]).includes(s);

// ---------- Idempotência ----------

/** JSON canônico: chaves de objetos ordenadas, para o mesmo corpo dar o mesmo fingerprint. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

export const idempotencyFingerprint = (body: unknown) => createHash("sha256").update(canonicalJson(body)).digest("hex");

export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{1,100}$/;
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotencyDecision = "novo" | "replay" | "mismatch" | "em_andamento" | "expirado";

/** Decide o que fazer com uma Idempotency-Key a partir do registro já existente (ou null). */
export function decideIdempotency(
  existing: { fingerprint: string | null; responseJson: unknown; createdAt: Date } | null,
  fingerprint: string,
  now: Date,
  ttlMs = IDEMPOTENCY_TTL_MS,
): IdempotencyDecision {
  if (!existing) return "novo";
  if (now.getTime() - existing.createdAt.getTime() > ttlMs) return "expirado";
  if (existing.fingerprint !== fingerprint) return "mismatch";
  if (existing.responseJson === null || existing.responseJson === undefined) return "em_andamento";
  return "replay";
}

// ---------- Limite de requisições ----------

/** Decide se uma requisição passa, dado quantas a chave já fez na janela. count = requisições anteriores. */
export function decideRate(count: number, limit: number): { ok: true } | { ok: false; retryAfter: number } {
  return count < limit ? { ok: true } : { ok: false, retryAfter: 60 };
}

/** Início do minuto (UTC) que contém `now`. Útil para relatórios e janelas alinhadas. */
export function windowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000);
}
