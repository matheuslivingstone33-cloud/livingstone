"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, clientIp, requireSession, type Session } from "@/lib/auth";
import { aiProvider, requestBodyAssistente } from "@/lib/ai";
import { meteredMessages } from "@/lib/ai-meter";
import { msgsPorUsuarioDia } from "@/lib/ai-config";
import {
  ID_RE,
  PLANO_VALIDADE_MS,
  ROTULO_ACAO,
  SYSTEM_ASSISTENTE,
  contextoSessao,
  decidirPlano,
  lerPlano,
  limparHistorico,
  montarMensagens,
  rodarLoop,
  toolDef,
  toolsPara,
  type Plano,
} from "@/lib/assistente";
import { responderSemIa } from "@/lib/assistente-guia";
import { executarConsulta } from "@/lib/servicos/assistente";
import { gerarPropostaServico } from "@/lib/servicos/cobranca";
import { pausarReguaServico } from "@/lib/servicos/regua";
import { atualizarResumoServico } from "@/lib/servicos/resumo";
import { diaSP, inicioDoDiaSP } from "@/lib/tz";

export type PlanoTela = { id: string; titulo: string; descricao: string };
export type RespostaAssistente = { ok: true; texto: string; plano?: PlanoTela } | { ok: false; erro: string };

const MAX_PERGUNTA = 1000;
const FALHA: Record<string, string> = {
  passos: "Não consegui terminar a resposta. Tente uma pergunta mais direta.",
  custo: "Não consegui terminar a resposta. Tente uma pergunta mais direta.",
  falha: "O assistente não respondeu agora. Tente de novo em instantes.",
  limite: "O teto diário de IA da instituição foi atingido. O assistente volta amanhã ou quando um administrador ajustar o teto.",
};

const ator = async (s: Session) => ({ orgId: s.orgId, userId: s.userId, nome: s.name, ip: await clientIp() });

/** Descrição determinística do plano, conferida no banco da instituição. null = não há o que propor. */
async function descreverPlano(s: Session, p: Plano): Promise<{ descricao: string } | { recusa: string }> {
  if (p.acao === "atualizar_resumo") return { descricao: "Atualizar o resumo do dia do painel com os números de agora." };
  const d = await db.debt.findFirst({ where: { id: p.alvo, orgId: s.orgId }, select: { contract: true, debtor: true, status: true, reguaPausedAt: true } });
  if (!d) return { recusa: "Não encontrei esse contrato na sua instituição." };
  const quem = `contrato ${d.contract} (${d.debtor.slice(0, 80)})`;
  if (p.acao === "gerar_proposta") {
    if (d.status === "ACORDO" || d.status === "QUITADO") return { recusa: `O ${quem} já tem acordo fechado; não há proposta a gerar.` };
    return { descricao: `Gerar uma proposta de acordo para o ${quem}. Uma proposta em aberto do contrato é substituída pela nova.` };
  }
  if (d.reguaPausedAt) return { recusa: `A régua do ${quem} já está pausada.` };
  return { descricao: `Pausar a régua de cobrança do ${quem}${p.motivo === "opt_out" ? ", porque o devedor pediu para não receber mensagens" : ""}.` };
}

export async function enviarMensagem(form: FormData): Promise<RespostaAssistente> {
  const s = await requireSession();
  const now = new Date();
  const pergunta = String(form.get("mensagem") ?? "").trim();
  if (!pergunta) return { ok: false, erro: "Escreva sua pergunta." };
  if (pergunta.length > MAX_PERGUNTA) return { ok: false, erro: `A pergunta pode ter até ${MAX_PERGUNTA} caracteres.` };
  let bruto: unknown = [];
  try {
    bruto = JSON.parse(String(form.get("historico") ?? "[]").slice(0, 100_000));
  } catch {
    bruto = [];
  }
  const historico = limparHistorico(bruto);

  // Limite diário por pessoa (dia em Brasília): conta as mensagens registradas na auditoria
  const limite = msgsPorUsuarioDia();
  const usadas = await db.auditLog.count({ where: { orgId: s.orgId, userId: s.userId, action: "assistente.mensagem", createdAt: { gte: inicioDoDiaSP(diaSP(now)) } } });
  if (usadas >= limite) {
    await audit(s, "assistente.limite", `Limite diário por pessoa atingido (${limite} mensagens)`);
    return { ok: false, erro: `Você chegou ao limite de ${limite} mensagens do assistente por hoje. Volte amanhã.` };
  }

  if (aiProvider() !== "claude") {
    await audit(s, "assistente.mensagem", "Sem IA: resposta pelo guia da plataforma");
    return { ok: true, texto: responderSemIa(pergunta) };
  }

  const tools = toolsPara(s.role);
  const defs = tools.map(toolDef);
  const call = meteredMessages(s.orgId, s.userId);
  const r = await rodarLoop({
    call: (m) => call(requestBodyAssistente(SYSTEM_ASSISTENTE, defs, m)),
    executar: (nome, e) => executarConsulta(s.orgId, nome, e, now),
    tools,
    mensagens: montarMensagens(historico, pergunta, contextoSessao(s.name, s.role, now)),
  });
  // Só metadados: nunca a pergunta nem a resposta
  await audit(s, "assistente.mensagem", `Passos ${r.passos} · ferramentas ${r.ferramentas.join(", ") || "nenhuma"} · custo US$ ${r.custoUsd.toFixed(4)} · fim ${r.fim}`.slice(0, 500));
  if (r.fim === "limite") await audit(s, "assistente.limite", "Teto diário de IA da instituição atingido");

  if (r.fim === "plano" && r.plano) {
    if (s.role !== "ADMIN" && s.role !== "ANALISTA") return { ok: true, texto: "Seu perfil só permite consultar. Peça a um analista ou administrador." };
    const d = await descreverPlano(s, r.plano);
    if ("recusa" in d) return { ok: true, texto: d.recusa };
    const p = r.plano;
    const row = await db.assistantPlan.create({
      data: { orgId: s.orgId, userId: s.userId, acao: p.acao, payload: { alvo: p.alvo ?? null, motivo: p.motivo ?? null, resumo: p.resumo }, expiresAt: new Date(now.getTime() + PLANO_VALIDADE_MS) },
      select: { id: true },
    });
    return { ok: true, texto: "Preparei a ação abaixo. Ela só acontece se você confirmar, em até 10 minutos.", plano: { id: row.id, titulo: ROTULO_ACAO[p.acao], descricao: d.descricao } };
  }
  const texto = r.fim === "resposta" && r.texto ? r.texto : FALHA[r.fim] ?? FALHA.falha;
  return { ok: true, texto: texto.slice(0, 2000) };
}

export async function confirmarPlano(planId: string): Promise<RespostaAssistente> {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const now = new Date();
  if (typeof planId !== "string" || !ID_RE.test(planId)) return { ok: false, erro: "Plano não encontrado." };
  const p = await db.assistantPlan.findFirst({ where: { id: planId, orgId: s.orgId } });
  const decisao = decidirPlano(p, s, now);
  if (decisao === "expirado") {
    await db.assistantPlan.updateMany({ where: { id: planId, orgId: s.orgId, status: "PENDENTE" }, data: { status: "EXPIRADO" } });
    return { ok: false, erro: "Este plano expirou. Peça de novo ao assistente." };
  }
  if (decisao !== "ok" || !p) return { ok: false, erro: "Plano não encontrado ou já usado." };
  const plano = lerPlano(p.acao, p.payload);
  if (!plano) return { ok: false, erro: "Plano inválido." };
  // Uso único: só um clique vence
  const uso = await db.assistantPlan.updateMany({ where: { id: p.id, orgId: s.orgId, userId: s.userId, status: "PENDENTE", expiresAt: { gt: now } }, data: { status: "EXECUTADO" } });
  if (uso.count !== 1) return { ok: false, erro: "Plano não encontrado ou já usado." };

  const a = await ator(s);
  let texto: string;
  if (plano.acao === "gerar_proposta" && plano.alvo) {
    const r = await gerarPropostaServico(a, plano.alvo);
    texto =
      r.status === "criada"
        ? `Proposta gerada para o contrato ${r.contract}. Abra o contrato em Cobrança para ver o link e a mensagem.`
        : r.status === "recente"
          ? `A proposta do contrato ${r.contract} acabou de ser gerada. Confira em Cobrança.`
          : r.status === "fechado"
            ? `O contrato ${r.contract} já tem acordo fechado.`
            : "Contrato não encontrado.";
    revalidatePath("/cobranca");
    revalidatePath(`/cobranca/${plano.alvo}`);
  } else if (plano.acao === "pausar_regua" && plano.alvo) {
    const r = await pausarReguaServico(a, plano.alvo, plano.motivo ?? "pausa");
    texto = r.ok ? `Régua pausada para o contrato ${r.contract}. Para retomar, abra o contrato em Cobrança.` : "Contrato não encontrado.";
    revalidatePath("/cobranca");
    revalidatePath(`/cobranca/${plano.alvo}`);
  } else {
    const r = await atualizarResumoServico(a);
    texto = r === "ok" ? "Resumo do dia atualizado. Veja no Painel." : "O resumo já está sendo atualizado. Aguarde alguns segundos.";
    revalidatePath("/dashboard");
  }
  await audit(s, "assistente.acao_confirmada", `${plano.acao} ${plano.alvo ?? "-"} via assistente`);
  return { ok: true, texto };
}
