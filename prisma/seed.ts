// Cria a organização e os usuários de demonstração.
// Online, defina DEMO_PASSWORD com uma senha forte: a senha padrão é só para uso local.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Demo@2026";
const users = [
  { name: "Ana Administradora", email: "admin@demo.local", role: "ADMIN" as const },
  { name: "Bruno Analista", email: "analista@demo.local", role: "ANALISTA" as const },
  { name: "Carla Auditora", email: "auditor@demo.local", role: "AUDITOR" as const },
];

async function main() {
  let org = await db.organization.findFirst({ where: { name: "Cooperativa de Crédito Demo" } });
  org ??= await db.organization.create({ data: { name: "Cooperativa de Crédito Demo" } });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of users)
    await db.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash, orgId: org.id } });
  // Lista interna fictícia usada pelos dados de demonstração de PLD
  if (!(await db.restrictedEntry.count({ where: { orgId: org.id, source: "INTERNA" } })))
    await db.restrictedEntry.create({
      data: {
        orgId: org.id,
        source: "INTERNA",
        name: "Construtora Horizonte Azul",
        nameKey: "CONSTRUTORA HORIZONTE AZUL",
        document: "99888777000166",
        reason: "Empresa citada em operação policial (lista interna de demonstração)",
      },
    });
  console.log(
    process.env.DEMO_PASSWORD
      ? "Usuários de demonstração prontos (senha definida em DEMO_PASSWORD)"
      : `Usuários de demonstração prontos (senha: ${DEMO_PASSWORD})`,
  );
}

main().finally(() => db.$disconnect());
