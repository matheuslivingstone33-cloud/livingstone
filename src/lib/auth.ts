import { createHash } from "node:crypto";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

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
// cada registro inclui o hash do anterior da mesma organização.
export async function auditRaw(orgId: string, userId: string | null, action: string, detail?: string, ip?: string | null) {
  await db.$transaction(async (tx) => {
    // Serializa as gravações por organização para a corrente não bifurcar
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`;
    const last = await tx.auditLog.findFirst({
      where: { orgId, hash: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { hash: true },
    });
    const createdAt = new Date();
    const prevHash = last?.hash ?? "GENESIS";
    const hash = auditHash({ prevHash, orgId, userId, action, detail: detail ?? null, ip: ip ?? null, createdAt });
    await tx.auditLog.create({ data: { orgId, userId, action, detail, ip, prevHash, hash, createdAt } });
  });
}

export function auditHash(r: { prevHash: string; orgId: string; userId: string | null; action: string; detail: string | null; ip: string | null; createdAt: Date }) {
  return createHash("sha256")
    .update([r.prevHash, r.orgId, r.userId ?? "", r.action, r.detail ?? "", r.ip ?? "", r.createdAt.toISOString()].join("␟"))
    .digest("hex");
}

export async function audit(s: Session, action: string, detail?: string) {
  await auditRaw(s.orgId, s.userId, action, detail, await clientIp());
}

// Confere a corrente inteira; devolve o primeiro registro adulterado, se houver
export async function verifyAuditChain(orgId: string) {
  const rows = await db.auditLog.findMany({ where: { orgId, hash: { not: null } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  let prev = "GENESIS";
  for (const r of rows) {
    const expected = auditHash({ ...r, prevHash: prev });
    if (r.prevHash !== prev || r.hash !== expected) return { ok: false as const, checked: rows.length, brokenAt: r };
    prev = r.hash!;
  }
  return { ok: true as const, checked: rows.length };
}

// Política de senha
export function passwordProblem(p: string): string | null {
  if (p.length < 12) return "A senha precisa ter ao menos 12 caracteres.";
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) return "A senha precisa ter letras e números.";
  if (/^(.)\1+$/.test(p) || /123456|senha|password|qwerty/i.test(p)) return "Senha muito previsível.";
  return null;
}

export const LOGIN_MAX_FAILS = 5;
export const LOGIN_LOCK_MINUTES = 15;
