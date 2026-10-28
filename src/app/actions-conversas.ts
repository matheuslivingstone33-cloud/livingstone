"use server";

// Conversas do assistente: leitura só pelo operador da plataforma (cross-org), sempre auditada. Nenhuma escrita aqui.
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { audit, auditRaw } from "@/lib/auth";
import { ID_RE } from "@/lib/assistente";
import { CONVERSAS_LIMITES, agruparConversas, type AnexoLog } from "@/lib/conversas";
import { listarInstituicoes, nomesDeOrgs, sessaoOperador } from "@/lib/operador";
import { escopoLeitura } from "@/lib/plataforma";

/** Uma linha por pessoa e instituição: última mensagem, total e custo. */
export async function listarConversas(orgFiltro?: string) {
  const s = await sessaoOperador();
  const escopo = escopoLeitura({ orgIdSessao: s.orgId, operador: true, orgFiltro });
  const grupos = await db.assistantMessageLog.groupBy({
    by: ["orgId", "userId"],
    where: escopo,
    _count: { _all: true },
    _max: { createdAt: true },
    _sum: { custoUsd: true },
  });
  const conversas = agruparConversas(grupos).slice(0, 500);
  const [usuarios, orgs, instituicoes] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...new Set(conversas.map((c) => c.userId))] } }, select: { id: true, name: true, email: true } }),
    nomesDeOrgs(conversas.map((c) => c.orgId)),
    listarInstituicoes(),
  ]);
  const u = new Map(usuarios.map((x) => [x.id, x]));
  return {
    instituicoes,
    conversas: conversas.map((c) => ({ ...c, nome: u.get(c.userId)?.name ?? "-", email: u.get(c.userId)?.email ?? "-", instituicao: orgs.get(c.orgId) ?? "-" })),
  };
}

/** Mensagens de uma pessoa, da mais antiga para a mais nova, de 100 em 100. */
export async function detalharConversa(userId: string, cursor?: string) {
  const s = await sessaoOperador();
  if (typeof userId !== "string" || !ID_RE.test(userId)) notFound();
  if (cursor !== undefined && (typeof cursor !== "string" || !ID_RE.test(cursor))) notFound();
  const escopo = escopoLeitura({ orgIdSessao: s.orgId, operador: true });
  const usuario = await db.user.findFirst({ where: { id: userId, ...escopo }, select: { id: true, name: true, email: true, orgId: true } });
  if (!usuario) notFound();
  const pagina = CONVERSAS_LIMITES.pagina;
  const rows = await db.assistantMessageLog.findMany({
    where: { userId: usuario.id, ...escopo },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: pagina + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const mensagens = rows.slice(0, pagina);
  const orgIds = [...new Set([usuario.orgId, ...mensagens.map((m) => m.orgId)])];
  const orgs = await nomesDeOrgs(orgIds);
  await audit(s, "conversa.visualizada", `Conversa do usuário ${usuario.id} · ${mensagens.length} mensagens${cursor ? " · página seguinte" : ""}`);
  // Leitura de outra instituição: registrada também na trilha dela
  for (const o of orgIds.filter((o) => o !== s.orgId))
    await auditRaw(o, null, "plataforma.conversa_visualizada", `Conversa do usuário ${usuario.id} lida pelo operador da plataforma (instituição ${s.orgId})`);
  return {
    usuario: { id: usuario.id, nome: usuario.name, email: usuario.email, instituicao: orgs.get(usuario.orgId) ?? "-" },
    mensagens: mensagens.map((m) => ({
      id: m.id,
      instituicao: orgs.get(m.orgId) ?? "-",
      pergunta: m.pergunta,
      resposta: m.resposta,
      fim: m.fim,
      ferramentas: m.ferramentas,
      passos: m.passos,
      custoUsd: Number(m.custoUsd),
      anexo: (m.anexo ?? null) as AnexoLog | null,
      pedidoId: m.pedidoId,
      documentoId: m.documentoId,
      planoId: m.planoId,
      em: m.createdAt,
    })),
    proximo: rows.length > pagina ? mensagens.at(-1)!.id : null,
  };
}
