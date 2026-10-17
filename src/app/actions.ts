"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_FAILS,
  audit,
  auditRaw,
  clientIp,
  createSession,
  destroySession,
  getSession,
  passwordProblem,
  requireSession,
} from "@/lib/auth";
import { BankFileError, parseBankFile, parseExpectedCsv, reconcile } from "@/lib/reconcile";
import { fail } from "@/lib/errors";
import { analyzeCredit } from "@/lib/credit";
import { analyzeLegacy } from "@/lib/legacy";
import { decodeText, readUpload } from "@/lib/upload";
import { getSettings } from "@/lib/settings";
import type { AiFile } from "@/lib/ai";

// Hash fixo para comparar quando o e-mail não existe: o tempo de resposta não revela quais e-mails são válidos
const DUMMY_HASH = bcrypt.hashSync("senha-inexistente-para-comparacao", 10);

export async function login(form: FormData) {
  const email = String(form.get("email") ?? "").toLowerCase().trim().slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, 200);
  const ip = await clientIp();
  const user = await db.user.findUnique({ where: { email } });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    await auditRaw(user.orgId, user.id, "login.bloqueado", `Tentativa durante bloqueio`, ip);
    redirect("/login?erro=bloqueado");
  }
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    if (user) {
      const fails = user.failedLogins + 1;
      const lock = fails >= LOGIN_MAX_FAILS;
      await db.user.update({
        where: { id: user.id },
        data: { failedLogins: lock ? 0 : fails, lockedUntil: lock ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000) : undefined },
      });
      await auditRaw(user.orgId, user.id, lock ? "login.bloqueio" : "login.falha", lock ? `Conta bloqueada por ${LOGIN_LOCK_MINUTES} min após ${LOGIN_MAX_FAILS} falhas` : `Falha ${fails}/${LOGIN_MAX_FAILS}`, ip);
    }
    redirect("/login?erro=1");
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(user.id, user.sessionVersion);
  await auditRaw(user.orgId, user.id, "login", undefined, ip);
  redirect("/dashboard");
}

export async function logout() {
  const s = await getSession();
  if (s) await audit(s, "logout");
  await destroySession();
  redirect("/login");
}

export async function createReconciliation(form: FormData) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const back = "/conciliacao";
  const bank = await readUpload(form.get("bankFile"), ["text"]).catch((e: Error) => fail(back, e.message));
  const exp = await readUpload(form.get("expectedFile"), ["text"]).catch((e: Error) => fail(back, e.message));
  if (!bank || !exp) fail(back, "Envie os dois arquivos.");

  const cfg = await getSettings(s.orgId);
  let parsed: ReturnType<typeof parseBankFile>;
  try {
    parsed = parseBankFile(bank.name, decodeText(bank.data), cfg.cnab400);
  } catch (e) {
    fail(back, e instanceof BankFileError ? e.message : "Não foi possível ler o arquivo do banco.");
  }
  const { format, entries } = parsed;
  const expected = parseExpectedCsv(decodeText(exp.data));
  if (!expected.length) fail(back, "Nenhum título válido na lista de esperados. Confira as colunas referencia e valor.");
  const items = reconcile(expected, entries);
  const count = (st: string) => items.filter((i) => i.status === st).length;

  const rec = await db.reconciliation.create({
    data: {
      orgId: s.orgId,
      name: String(form.get("name") || `Conciliação ${new Date().toLocaleDateString("pt-BR")}`).slice(0, 120),
      bankFileName: bank.name,
      bankFormat: format,
      expectedFileName: exp.name,
      totalExpected: expected.reduce((a, e) => a + e.amount, 0),
      totalReceived: entries.reduce((a, e) => a + e.amount, 0),
      matched: count("CONCILIADO"),
      divergent: count("DIVERGENTE"),
      missing: count("PENDENTE"),
      unexpected: count("NAO_ESPERADO"),
      items: { create: items },
    },
  });
  await audit(s, "conciliacao.criar", `${rec.name} (${format}, ${items.length} itens)`);
  revalidatePath("/conciliacao");
  redirect(`/conciliacao/${rec.id}`);
}

export async function createCreditAnalysis(form: FormData) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const back = "/credito";
  const entries = form.getAll("docs").slice(0, 10);
  const files = (await Promise.all(entries.map((e) => readUpload(e, ["text", "pdf", "image"]))).catch((e: Error) => fail(back, e.message))).filter(
    (f): f is AiFile => !!f,
  );
  if (!files.length) fail(back, "Envie ao menos um documento.");
  const input = {
    applicant: String(form.get("applicant") ?? "").trim().slice(0, 120),
    document: String(form.get("document") ?? "").trim().slice(0, 20),
    requested: Number(String(form.get("requested")).replace(/\./g, "").replace(",", ".")),
    months: Number(form.get("months")),
    monthlyRate: Number(String(form.get("rate")).replace(",", ".")) / 100,
  };
  if (!input.applicant || !(input.requested > 0 && input.requested < 100_000_000)) fail(back, "Preencha o solicitante e um valor válido.");
  if (!(Number.isInteger(input.months) && input.months >= 1 && input.months <= 420)) fail(back, "Prazo deve ser de 1 a 420 meses.");
  if (!(input.monthlyRate >= 0 && input.monthlyRate <= 0.2)) fail(back, "Taxa deve estar entre 0% e 20% ao mês.");

  const r = await analyzeCredit(input, files, (await getSettings(s.orgId)).credit);
  const rec = await db.creditAnalysis.create({
    data: {
      orgId: s.orgId,
      applicant: input.applicant,
      document: input.document,
      requested: input.requested,
      score: r.score,
      decision: r.decision,
      extracted: r.extracted,
      flags: r.flags,
      opinion: r.opinion,
      aiProvider: r.provider,
      fileNames: files.map((f) => f.name),
    },
  });
  await audit(s, "credito.analisar", `${input.applicant}: ${r.decision} (score ${r.score})`);
  revalidatePath("/credito");
  redirect(`/credito/${rec.id}`);
}

export async function createLegacyAnalysis(form: FormData) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const f = await readUpload(form.get("source"), ["text"]).catch((e: Error) => fail("/legado", e.message));
  if (!f) fail("/legado", "Envie um arquivo de código.");
  const target = ["TypeScript", "Java", "C#", "Python"].includes(String(form.get("target"))) ? String(form.get("target")) : "TypeScript";

  const r = await analyzeLegacy(f.name, decodeText(f.data), target);
  const rec = await db.legacyAnalysis.create({
    data: {
      orgId: s.orgId,
      fileName: f.name,
      language: r.language,
      target,
      linesOfCode: r.linesOfCode,
      summary: r.summary,
      rules: r.rules,
      modernCode: r.modernCode,
      aiProvider: r.provider,
    },
  });
  await audit(s, "legado.analisar", `${f.name} (${r.language} → ${target})`);
  revalidatePath("/legado");
  redirect(`/legado/${rec.id}`);
}

const ROLES = ["ADMIN", "ANALISTA", "AUDITOR"] as const;
type Role = (typeof ROLES)[number];
const asRole = (v: unknown): Role => (ROLES.includes(v as Role) ? (v as Role) : "ANALISTA");

export async function createUser(form: FormData) {
  const s = await requireSession(["ADMIN"]);
  const back = "/usuarios";
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const password = String(form.get("password") ?? "");
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(back, "Informe nome e e-mail válidos.");
  const problem = passwordProblem(password);
  if (problem) fail(back, problem);
  if (await db.user.findUnique({ where: { email } })) fail(back, "Já existe um usuário com este e-mail.");
  await db.user.create({ data: { orgId: s.orgId, name, email, role: asRole(form.get("role")), passwordHash: await bcrypt.hash(password, 12) } });
  await audit(s, "usuario.criar", email);
  revalidatePath(back);
}

async function ownUser(orgId: string, userId: string) {
  const u = await db.user.findFirst({ where: { id: userId, orgId } });
  if (!u) fail("/usuarios", "Usuário não encontrado.");
  return u;
}

// Sempre resta ao menos um administrador ativo: a instituição nunca fica trancada para fora
async function guardLastAdmin(orgId: string, userId: string) {
  const admins = await db.user.count({ where: { orgId, role: "ADMIN", active: true, id: { not: userId } } });
  if (!admins) fail("/usuarios", "É preciso manter ao menos um administrador ativo.");
}

export async function setUserActive(userId: string, active: boolean) {
  const s = await requireSession(["ADMIN"]);
  const u = await ownUser(s.orgId, userId);
  if (!active) await guardLastAdmin(s.orgId, u.id);
  // Desativar derruba as sessões abertas na hora
  await db.user.update({ where: { id: u.id }, data: { active, sessionVersion: { increment: 1 } } });
  await audit(s, active ? "usuario.reativar" : "usuario.desativar", u.email);
  revalidatePath("/usuarios");
}

export async function changeUserRole(userId: string, form: FormData) {
  const s = await requireSession(["ADMIN"]);
  const u = await ownUser(s.orgId, userId);
  const role = asRole(form.get("role"));
  if (u.role === "ADMIN" && role !== "ADMIN") await guardLastAdmin(s.orgId, u.id);
  await db.user.update({ where: { id: u.id }, data: { role, sessionVersion: { increment: 1 } } });
  await audit(s, "usuario.perfil", `${u.email}: ${u.role} → ${role}`);
  revalidatePath("/usuarios");
}

export async function revokeUserSessions(userId: string) {
  const s = await requireSession(["ADMIN"]);
  const u = await ownUser(s.orgId, userId);
  await db.user.update({ where: { id: u.id }, data: { sessionVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null } });
  await audit(s, "usuario.encerrar_sessoes", u.email);
  revalidatePath("/usuarios");
}

export async function changeOwnPassword(form: FormData) {
  const s = await requireSession();
  const back = "/conta";
  const u = await db.user.findUniqueOrThrow({ where: { id: s.userId } });
  if (!(await bcrypt.compare(String(form.get("current") ?? ""), u.passwordHash))) fail(back, "Senha atual incorreta.");
  const next = String(form.get("next") ?? "");
  const problem = passwordProblem(next);
  if (problem) fail(back, problem);
  if (next !== String(form.get("confirm") ?? "")) fail(back, "A confirmação não confere com a nova senha.");
  const updated = await db.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(next, 12), sessionVersion: { increment: 1 } } });
  await audit(s, "usuario.trocar_senha", u.email);
  // Troca de senha encerra as outras sessões; esta continua com o novo número de versão
  await createSession(u.id, updated.sessionVersion);
  redirect("/conta?ok=1");
}
