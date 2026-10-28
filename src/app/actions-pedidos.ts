"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, auditRaw, requireSession, type Session } from "@/lib/auth";
import { ehOperadorSessao, listarInstituicoes, nomesDeOrgs } from "@/lib/operador";
import { escopoLeitura } from "@/lib/plataforma";
import { ID_RE } from "@/lib/assistente";
import { lerTranscricao, lerVersoes, montarPrompt, podeTransicionar, podeVerPedidos, versaoAtual } from "@/lib/pedidos";

export type RespostaPedido = { ok: true; texto: string } | { ok: false; erro: string };

const NAO_ENCONTRADO = "Pedido não encontrado ou já confirmado.";

/** A pessoa confirma a versão que está vendo. Só vale se ela ainda for a mais recente. */
export async function confirmarEntendimento(pedidoId: string, versao: number): Promise<RespostaPedido> {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const now = new Date();
  if (typeof pedidoId !== "string" || !ID_RE.test(pedidoId) || !Number.isInteger(versao) || versao < 1) return { ok: false, erro: NAO_ENCONTRADO };
  const p = await db.featureRequest.findFirst({
    where: { id: pedidoId, orgId: s.orgId, userId: s.userId, status: "AGUARDANDO_CONFIRMACAO" },
    select: { id: true, titulo: true, status: true, versoes: true, updatedAt: true },
  });
  if (!p || !podeTransicionar(p.status, "CONSENSO")) return { ok: false, erro: NAO_ENCONTRADO };
  const atual = versaoAtual(p.versoes);
  if (!atual || atual.n !== versao) return { ok: false, erro: "Há uma versão mais nova deste entendimento. Confira a última." };
  // updatedAt igual ao lido: nenhuma versão nova entrou entre a leitura e a gravação
  const up = await db.featureRequest.updateMany({
    where: { id: p.id, orgId: s.orgId, userId: s.userId, status: "AGUARDANDO_CONFIRMACAO", updatedAt: p.updatedAt },
    data: { status: "CONSENSO", prompt: montarPrompt({ titulo: p.titulo, versao: atual }, now) },
  });
  if (up.count !== 1) return { ok: false, erro: "Há uma versão mais nova deste entendimento. Confira a última." };
  await audit(s, "pedido.consenso", `Pedido ${p.id} · versão ${versao}`);
  revalidatePath("/pedidos");
  return { ok: true, texto: "Registrado para a equipe avaliar." };
}

/** A pessoa quer ajustar: volta para a conversa. */
export async function ajustarEntendimento(pedidoId: string): Promise<RespostaPedido> {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  if (typeof pedidoId !== "string" || !ID_RE.test(pedidoId) || !podeTransicionar("AGUARDANDO_CONFIRMACAO", "EM_CONVERSA")) return { ok: false, erro: NAO_ENCONTRADO };
  const up = await db.featureRequest.updateMany({
    where: { id: pedidoId, orgId: s.orgId, userId: s.userId, status: "AGUARDANDO_CONFIRMACAO" },
    data: { status: "EM_CONVERSA" },
  });
  if (up.count !== 1) return { ok: false, erro: NAO_ENCONTRADO };
  await audit(s, "pedido.ajuste", `Pedido ${pedidoId}`);
  return { ok: true, texto: "O que devo mudar?" };
}

// ---------- Leitura (/pedidos) ----------

async function emailDe(s: Session) {
  const u = await db.user.findFirst({ where: { id: s.userId, orgId: s.orgId }, select: { email: true } });
  return u?.email ?? null;
}

/** Se a pessoa pode ver /pedidos (e-mail em PEDIDOS_VIEWERS). Interno: não é exportado como action. */
async function vePedidos(s: Session): Promise<boolean> {
  return podeVerPedidos(await emailDe(s), process.env.PEDIDOS_VIEWERS);
}

async function sessaoLeitora(): Promise<Session> {
  const s = await requireSession();
  if (!(await vePedidos(s))) notFound();
  return s;
}

/** Autores pelos IDs, dentro do escopo de leitura (a própria instituição ou, para o operador, a consultada). */
const autores = async (escopo: { orgId?: string }, ids: string[]) =>
  new Map((await db.user.findMany({ where: { ...escopo, id: { in: [...new Set(ids)] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

/** Lista de pedidos. O operador da plataforma pode ver todas as instituições ou filtrar uma (só leitura). */
export async function listarPedidos(orgFiltro?: string) {
  const s = await sessaoLeitora();
  const operador = await ehOperadorSessao(s);
  const escopo = escopoLeitura({ orgIdSessao: s.orgId, operador, orgFiltro });
  const rows = await db.featureRequest.findMany({
    where: escopo,
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, orgId: true, titulo: true, status: true, userId: true, versoes: true, updatedAt: true },
  });
  const [nomes, orgs] = await Promise.all([autores(escopo, rows.map((r) => r.userId)), nomesDeOrgs(rows.map((r) => r.orgId))]);
  return rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    status: r.status,
    autor: nomes.get(r.userId) ?? "-",
    instituicao: orgs.get(r.orgId) ?? "-",
    versoes: lerVersoes(r.versoes).length,
    atualizadoEm: r.updatedAt,
  }));
}

export async function detalharPedido(id: string) {
  const s = await sessaoLeitora();
  if (typeof id !== "string" || !ID_RE.test(id)) notFound();
  const operador = await ehOperadorSessao(s);
  const p = await db.featureRequest.findFirst({ where: { id, ...escopoLeitura({ orgIdSessao: s.orgId, operador }) } });
  if (!p) notFound();
  const [nomes, orgs] = await Promise.all([autores({ orgId: p.orgId }, [p.userId]), nomesDeOrgs([p.orgId])]);
  await audit(s, "pedido.visualizado", `Pedido ${p.id}${p.orgId !== s.orgId ? ` · instituição ${p.orgId}` : ""}`);
  // Leitura de outra instituição: fica registrada também na trilha dela
  if (p.orgId !== s.orgId) await auditRaw(p.orgId, null, "plataforma.pedido_visualizado", `Pedido ${p.id} lido pelo operador da plataforma (instituição ${s.orgId})`);
  return {
    id: p.id,
    titulo: p.titulo,
    status: p.status,
    autor: nomes.get(p.userId) ?? "-",
    instituicao: orgs.get(p.orgId) ?? "-",
    criadoEm: p.createdAt,
    atualizadoEm: p.updatedAt,
    versoes: lerVersoes(p.versoes),
    transcricao: lerTranscricao(p.transcricao),
    prompt: p.prompt,
  };
}

/** Filtro de instituição em /pedidos: só para o operador (os demais recebem lista vazia). */
export async function instituicoesParaFiltro() {
  const s = await sessaoLeitora();
  return (await ehOperadorSessao(s)) ? listarInstituicoes() : [];
}
