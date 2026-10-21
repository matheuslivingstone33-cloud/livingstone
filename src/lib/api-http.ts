// Camada HTTP da API pública (/api/v1): autenticação por chave, escopo, limite de requisições,
// idempotência e registro das chamadas. Toda rota em src/app/api/v1 passa por withApiKey.
import { NextResponse } from "next/server";
import { Prisma, type ApiKey } from "@prisma/client";
import { db } from "./db";
import {
  IDEMPOTENCY_KEY_RE,
  decideIdempotency,
  hasScope,
  hashKey,
  idempotencyFingerprint,
  parseBearer,
  safeEqualHex,
  type ApiScope,
} from "./api-keys";
import { formatBytes } from "./upload-limits";

// Cabe no corpo máximo de função da Vercel (~4,5 MB)
export const API_MAX_BODY_BYTES = 4 * 1024 * 1024;
export const API_RATE_PER_MINUTE = 60;

export function apiError(status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status, headers });
}

const errBody = (code: string, message: string, details?: unknown) => ({ error: { code, message, ...(details !== undefined ? { details } : {}) } });

export type ApiContext = { key: Pick<ApiKey, "id" | "orgId" | "prefix" | "scopes">; orgId: string; body: unknown; ip: string | null; params: URLSearchParams };
export type ApiResult = { status: number; json: unknown; resourceType?: string; resourceId?: string };

const unauthorized = () => apiError(401, "unauthorized", "Chave de API ausente, inválida ou revogada.", undefined, { "WWW-Authenticate": "Bearer" });

async function readLimited(req: Request): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > API_MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function requestIp(req: Request) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim() || null;
}

export async function withApiKey(req: Request, scope: ApiScope, handler: (ctx: ApiContext) => Promise<ApiResult>): Promise<NextResponse> {
  const method = req.method.toUpperCase();
  const url = new URL(req.url);
  const path = url.pathname.slice(0, 300);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > API_MAX_BODY_BYTES) return apiError(413, "payload_too_large", `Corpo acima de ${formatBytes(API_MAX_BODY_BYTES)}.`);

  // Autenticação: a resposta é sempre a mesma para chave ausente, malformada, desconhecida ou revogada
  const bearer = parseBearer(req.headers.get("authorization"));
  if (!bearer) return unauthorized();
  const key = await db.apiKey.findUnique({ where: { prefix: bearer.prefix } });
  if (!key || !safeEqualHex(hashKey(bearer.secret), key.hash) || key.revokedAt) return unauthorized();
  if (!hasScope(key.scopes, scope)) return apiError(403, "insufficient_scope", `Esta chave não tem o escopo ${scope}.`);

  const now = new Date();
  // Limite por chave, contado no banco (vale entre instâncias serverless)
  const recent = await db.apiRequest.count({ where: { apiKeyId: key.id, createdAt: { gte: new Date(now.getTime() - 60_000) } } });
  if (recent >= API_RATE_PER_MINUTE)
    return apiError(429, "rate_limited", `Limite de ${API_RATE_PER_MINUTE} requisições por minuto excedido.`, undefined, { "Retry-After": "60" });

  if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > 60_000)
    await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: now } }).catch(() => {});

  const base = { orgId: key.orgId, apiKeyId: key.id, method, path };
  const ctxBase = { key, orgId: key.orgId, ip: requestIp(req), params: url.searchParams };

  if (method !== "POST") {
    let r: ApiResult;
    try {
      r = await handler({ ...ctxBase, body: null });
    } catch (e) {
      console.error("api", method, path, e instanceof Error ? e.message : e);
      r = { status: 500, json: errBody("internal_error", "Erro interno. Tente novamente.") };
    }
    await db.apiRequest.create({ data: { ...base, status: r.status, resourceType: r.resourceType, resourceId: r.resourceId } }).catch(() => {});
    return NextResponse.json(r.json, { status: r.status });
  }

  // POST: Idempotency-Key obrigatório
  const idemKey = req.headers.get("idempotency-key") ?? "";
  if (!IDEMPOTENCY_KEY_RE.test(idemKey))
    return apiError(400, "idempotency_key_required", "Envie o header Idempotency-Key (1 a 100 caracteres: letras, números, _ ou -).");

  const raw = await readLimited(req);
  if (raw === null) return apiError(413, "payload_too_large", `Corpo acima de ${formatBytes(API_MAX_BODY_BYTES)}.`);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError(400, "invalid_json", "O corpo não é um JSON válido.");
  }
  const fingerprint = idempotencyFingerprint(body);

  const existing = await db.apiRequest.findUnique({ where: { apiKeyId_idempotencyKey: { apiKeyId: key.id, idempotencyKey: idemKey } } });
  const decision = decideIdempotency(existing, fingerprint, now);
  if (decision === "replay" && existing)
    return NextResponse.json(existing.responseJson, { status: existing.status, headers: { "Idempotent-Replay": "true" } });
  if (decision === "mismatch")
    return apiError(422, "idempotency_key_reused", "Esta Idempotency-Key já foi usada com outro corpo. Use uma chave nova.");
  if (decision === "em_andamento")
    return apiError(409, "request_in_progress", "Uma requisição com esta Idempotency-Key ainda está em processamento.");
  if (decision === "expirado" && existing) await db.apiRequest.delete({ where: { id: existing.id } }).catch(() => {});

  // Reserva a chave antes de processar: requisições simultâneas com a mesma chave recebem 409
  let reqId: string;
  try {
    reqId = (await db.apiRequest.create({ data: { ...base, status: 0, idempotencyKey: idemKey, fingerprint } })).id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return apiError(409, "request_in_progress", "Uma requisição com esta Idempotency-Key ainda está em processamento.");
    throw e;
  }

  let r: ApiResult;
  try {
    r = await handler({ ...ctxBase, body });
  } catch (e) {
    console.error("api", method, path, e instanceof Error ? e.message : e);
    // Falha interna: libera a chave para o cliente tentar de novo, mas mantém o registro para o limite
    await db.apiRequest.update({ where: { id: reqId }, data: { status: 500, idempotencyKey: null } }).catch(() => {});
    return apiError(500, "internal_error", "Erro interno. Tente novamente.");
  }
  await db.apiRequest.update({
    where: { id: reqId },
    data: { status: r.status, responseJson: (r.json ?? Prisma.JsonNull) as Prisma.InputJsonValue, resourceType: r.resourceType, resourceId: r.resourceId },
  });
  return NextResponse.json(r.json, { status: r.status });
}

export { errBody };
