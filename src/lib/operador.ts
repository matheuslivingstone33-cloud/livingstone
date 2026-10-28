// Sessão do operador da plataforma (servidor). Não é "use server": nada aqui vira action chamável pelo navegador.
import { notFound } from "next/navigation";
import { db } from "./db";
import { requireSession, type Session } from "./auth";
import { ehOperador } from "./plataforma";

/** Se a pessoa da sessão é operador da plataforma (e-mail em PLATFORM_OPERATORS; ausente = padrão). */
export async function ehOperadorSessao(s: Session): Promise<boolean> {
  const u = await db.user.findFirst({ where: { id: s.userId, orgId: s.orgId }, select: { email: true } });
  return ehOperador(u?.email, process.env.PLATFORM_OPERATORS);
}

/** Exige operador; para os demais a rota simplesmente não existe. */
export async function sessaoOperador(): Promise<Session> {
  const s = await requireSession();
  if (!(await ehOperadorSessao(s))) notFound();
  return s;
}

/** Instituições para o filtro do operador. */
export const listarInstituicoes = () => db.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

export async function nomesDeOrgs(ids: string[]) {
  const rows = await db.organization.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  return new Map(rows.map((o) => [o.id, o.name]));
}
