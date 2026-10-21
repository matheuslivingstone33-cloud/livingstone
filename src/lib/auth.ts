import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { auditHash, auditHashV2, initialChainState, verifyBatch, type ChainProblem } from "./audit-chain";

const COOKIE = "finops_session";
const SESSION_HOURS = 8;

// Falha fechada: sem um segredo forte o sistema não assina nem aceita sessões
export function authSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou curto (mínimo 32 caracteres). Configure-o no ambiente.");
  return new TextEncoder().encode(s);
}

export type Session = { userId: string; orgId: string; role: string; name: string };
type Token = { userId: string; v: number };

export async function createSession(userId: string, sessionVersion: number) {
  const token = await new SignJWT({ userId, v: sessionVersion } satisfies Token)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(authSecret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * SESSION_HOURS,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

// O token só identifica o usuário; perfil, organização e status vêm sempre do banco.
// Assim, desativar um usuário ou mudar seu perfil vale na próxima requisição.
export const getSession = cache(async (): Promise<Session | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  let t: Token;
  try {
    t = (await jwtVerify(raw, authSecret())).payload as unknown as Token;
  } catch {
    return null;
  }
  const u = await db.user.findUnique({ where: { id: t.userId } });
  if (!u || !u.active || u.sessionVersion !== t.v) return null;
  return { userId: u.id, orgId: u.orgId, role: u.role, name: u.name };
});

export async function requireSession(roles?: string[]) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.role)) redirect("/dashboard");
  return s;
}

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
}

// Trilha de auditoria encadeada por hash (à prova de adulteração):
// cada registro inclui o hash do anterior da mesma organização e um número de sequência (v2).
// Registros antigos sem seq seguem a v1; o primeiro v2 encadeia no último hash v1.
export async function auditRaw(orgId: string, userId: string | null, action: string, detail?: string, ip?: string | null) {
  await db.$transaction(async (tx) => {
    // Serializa as gravações por organização para a corrente não bifurcar
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`;
    const last = await tx.auditLog.findFirst({ where: { orgId, seq: { not: null } }, orderBy: { seq: "desc" }, select: { hash: true, seq: true } });
    let prevHash: string;
    let seq: number;
    if (last?.seq != null && last.hash) {
      prevHash = last.hash;
      seq = last.seq + 1;
    } else {
      const v1 = await tx.auditLog.findFirst({ where: { orgId, hash: { not: null } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { hash: true } });
      prevHash = v1?.hash ?? "GENESIS";
      seq = 1;
    }
    const createdAt = new Date();
    const hash = auditHashV2({ prevHash, seq, orgId, userId, action, detail: detail ?? null, ip: ip ?? null, createdAt });
    // Violação de @@unique([orgId, seq]) (P2002) propaga: nunca gravar fora da corrente
    await tx.auditLog.create({ data: { orgId, userId, action, detail, ip, prevHash, hash, seq, createdAt } });
  });
}

export { auditHash };

export async function audit(s: Session, action: string, detail?: string) {
  await auditRaw(s.orgId, s.userId, action, detail, await clientIp());
}

export type ChainCheck = { ok: boolean; checked: number; legacy: number; lastSeq: number; lastHash: string; problema?: ChainProblem };

// Confere a corrente em lotes de 1000 (sem carregar tudo na memória). upToSeq limita a conferência v2.
export async function verifyAuditChain(orgId: string, upToSeq?: number): Promise<ChainCheck> {
  const first = await db.auditLog.findFirst({ where: { orgId, seq: { not: null } }, orderBy: { seq: "asc" }, select: { createdAt: true } });
  let state = initialChainState(first?.createdAt ?? null);
  const where = upToSeq != null ? { orgId, OR: [{ seq: null }, { seq: { lte: upToSeq } }] } : { orgId };
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.auditLog.findMany({
      where,
      orderBy: [{ seq: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }, { id: "asc" }],
      take: 1000,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, seq: true, prevHash: true, hash: true, orgId: true, userId: true, action: true, detail: true, ip: true, createdAt: true },
    });
    const r = verifyBatch(state, rows);
    state = r.state;
    if (r.problema) return { ok: false, checked: state.checked, legacy: state.legacy, lastSeq: state.nextSeq - 1, lastHash: state.prev, problema: r.problema };
    if (rows.length < 1000) break;
    cursor = rows[rows.length - 1].id;
  }
  return { ok: true, checked: state.checked, legacy: state.legacy, lastSeq: state.nextSeq - 1, lastHash: state.prev };
}

// Política de senha
export { passwordProblem } from "./password";

export const LOGIN_MAX_FAILS = 5;
export const LOGIN_LOCK_MINUTES = 15;
