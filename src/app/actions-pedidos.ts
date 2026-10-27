"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireSession, type Session } from "@/lib/auth";
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

const autores = async (orgId: string, ids: string[]) =>
  new Map((await db.user.findMany({ where: { orgId, id: { in: [...new Set(ids)] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

export async function listarPedidos() {
  const s = await sessaoLeitora();
  const rows = await db.featureRequest.findMany({
    where: { orgId: s.orgId },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, titulo: true, status: true, userId: true, versoes: true, updatedAt: true },
  });
  const nomes = await autores(s.orgId, rows.map((r) => r.userId));
  return rows.map((r) => ({ id: r.id, titulo: r.titulo, status: r.status, autor: nomes.get(r.userId) ?? "-", versoes: lerVersoes(r.versoes).length, atualizadoEm: r.updatedAt }));
}

export async function detalharPedido(id: string) {
  const s = await sessaoLeitora();
  if (typeof id !== "string" || !ID_RE.test(id)) notFound();
  const p = await db.featureRequest.findFirst({ where: { id, orgId: s.orgId } });
  if (!p) notFound();
  const nomes = await autores(s.orgId, [p.userId]);
  await audit(s, "pedido.visualizado", `Pedido ${p.id}`);
  return {
    id: p.id,
    titulo: p.titulo,
    status: p.status,
    autor: nomes.get(p.userId) ?? "-",
    criadoEm: p.createdAt,
    atualizadoEm: p.updatedAt,
    versoes: lerVersoes(p.versoes),
    transcricao: lerTranscricao(p.transcricao),
    prompt: p.prompt,
  };
}
