// Move um usuário para outra instituição (pelo nome). Sem --aplicar, só mostra o que faria (dry-run).
//   npx tsx scripts/mover-usuario-org.mts --email pessoa@exemplo.com --org "Nome da instituição" [--aplicar]
// Rollback: rodar de novo com --org "<nome da instituição antiga>".
// O que muda (tudo numa transação de 30 s):
//   - cria a instituição destino (settings {}) se não existir; aborta se houver mais de uma com o mesmo nome;
//   - pedidos (FeatureRequest) do usuário vão junto;
//   - planos do assistente PENDENTE viram EXPIRADO;
//   - rascunhos de documento do usuário são apagados (confirmados ficam na instituição antiga);
//   - chaves de API criadas por ele são revogadas;
//   - user.orgId muda e sessionVersion sobe (derruba as sessões abertas);
//   - auditoria nas duas instituições, na mesma corrente de hash e com o mesmo advisory lock de auditRaw.
// O histórico (auditoria, conversas do assistente, consumo de IA) continua na instituição antiga.
// Idempotente: se o usuário já está na instituição destino, não faz nada.
import { PrismaClient, type Prisma } from "@prisma/client";
import { auditHashV2 } from "../src/lib/audit-chain";
import { ehOperador } from "../src/lib/plataforma";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const email = arg("email")?.trim().toLowerCase();
const orgNome = arg("org")?.trim();
const aplicar = process.argv.includes("--aplicar");

if (!email || !orgNome) {
  console.error('Uso: npx tsx scripts/mover-usuario-org.mts --email <e-mail> --org "<nome da instituição>" [--aplicar]');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}
let host = "?";
try {
  host = new URL(url).host;
} catch {
  console.error("DATABASE_URL inválida.");
  process.exit(1);
}
console.log(`Banco: ${host}`);
console.log(aplicar ? "Modo: APLICAR" : "Modo: simulação (dry-run). Use --aplicar para gravar.");

if (ehOperador(email, process.env.PLATFORM_OPERATORS)) {
  console.error("Abortado: este e-mail é de um operador da plataforma.");
  process.exit(1);
}

const db = new PrismaClient();

/** Mesma lógica de auditRaw (src/lib/auth.ts): advisory lock por instituição e corrente v2. */
async function auditTx(tx: Prisma.TransactionClient, orgId: string, action: string, detail: string) {
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
  const userId = null;
  const ip = null;
  const hash = auditHashV2({ prevHash, seq, orgId, userId, action, detail, ip, createdAt });
  await tx.auditLog.create({ data: { orgId, userId, action, detail, ip, prevHash, hash, seq, createdAt } });
}

async function contagens(tx: Prisma.TransactionClient, userId: string, orgId: string) {
  const [pedidos, planosPendentes, rascunhos, confirmados, chavesAtivas] = await Promise.all([
    tx.featureRequest.count({ where: { userId, orgId } }),
    tx.assistantPlan.count({ where: { userId, orgId, status: "PENDENTE" } }),
    tx.documentoBiblioteca.count({ where: { criadoPor: userId, orgId, status: "RASCUNHO" } }),
    tx.documentoBiblioteca.count({ where: { criadoPor: userId, orgId, status: "CONFIRMADO" } }),
    tx.apiKey.count({ where: { createdById: userId, orgId, revokedAt: null } }),
  ]);
  return { pedidos, planosPendentes, rascunhos, confirmados, chavesAtivas };
}

class Simulacao extends Error {}

try {
  await db.$transaction(
    async (tx) => {
      const achados = await tx.user.findMany({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, name: true, orgId: true } });
      if (achados.length !== 1) throw new Error(achados.length ? "Mais de um usuário com este e-mail. Abortado." : "Usuário não encontrado.");
      const u = achados[0];
      const origem = await tx.organization.findUnique({ where: { id: u.orgId }, select: { id: true, name: true } });
      const destinos = await tx.organization.findMany({ where: { name: orgNome }, select: { id: true, name: true } });
      if (destinos.length > 1) throw new Error(`Há ${destinos.length} instituições com o nome "${orgNome}". Abortado.`);
      const existente = destinos[0];
      console.log(`Usuário: ${u.name} (${u.id})`);
      console.log(`Origem: ${origem?.name ?? "?"} (${u.orgId})`);
      console.log(`Destino: ${orgNome}${existente ? ` (${existente.id})` : " (será criada)"}`);
      if (existente?.id === u.orgId) {
        console.log("O usuário já está na instituição destino. Nada a fazer.");
        return;
      }
      console.log("Antes, na origem:", await contagens(tx, u.id, u.orgId));
      if (!aplicar) throw new Simulacao();

      const destino = existente ?? (await tx.organization.create({ data: { name: orgNome, settings: {} }, select: { id: true, name: true } }));
      const now = new Date();
      const pedidos = await tx.featureRequest.updateMany({ where: { userId: u.id, orgId: u.orgId }, data: { orgId: destino.id } });
      const planos = await tx.assistantPlan.updateMany({ where: { userId: u.id, orgId: u.orgId, status: "PENDENTE" }, data: { status: "EXPIRADO" } });
      const rascunhos = await tx.documentoBiblioteca.deleteMany({ where: { criadoPor: u.id, orgId: u.orgId, status: "RASCUNHO" } });
      const chaves = await tx.apiKey.updateMany({ where: { createdById: u.id, orgId: u.orgId, revokedAt: null }, data: { revokedAt: now } });
      await tx.user.update({ where: { id: u.id }, data: { orgId: destino.id, sessionVersion: { increment: 1 } } });
      const resumo = `${pedidos.count} pedidos movidos, ${planos.count} planos expirados, ${rascunhos.count} rascunhos apagados, ${chaves.count} chaves de API revogadas`;
      await auditTx(tx, u.orgId, "plataforma.usuario_movido", `Usuário ${u.id} saiu para a instituição ${destino.id} (script) · ${resumo}`);
      await auditTx(tx, destino.id, "plataforma.usuario_movido", `Usuário ${u.id} chegou da instituição ${u.orgId} (script) · ${resumo}`);
      console.log("Depois, na origem:", await contagens(tx, u.id, u.orgId));
      console.log("Depois, no destino:", await contagens(tx, u.id, destino.id));
      console.log(`Aplicado: ${resumo}.`);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
} catch (e) {
  if (e instanceof Simulacao) console.log("Simulação: nada foi gravado.");
  else {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
