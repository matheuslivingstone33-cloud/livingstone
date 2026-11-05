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
import { montarLogMensagem, type AnexoLog } from "@/lib/conversas";
import { untrusted } from "@/lib/ai-prompt";
import { anexarTranscricao, novaVersao, versaoAtual, type Entendimento } from "@/lib/pedidos";
import { executarConsulta } from "@/lib/servicos/assistente";
import { gerarPropostaServico } from "@/lib/servicos/cobranca";
import { pausarReguaServico } from "@/lib/servicos/regua";
import { atualizarResumoServico } from "@/lib/servicos/resumo";
import { diaSP, inicioDoDiaSP } from "@/lib/tz";
import { UploadError, assertUploadTotal, readUpload } from "@/lib/upload";
import { pdfPaginas, pdfTextoPaginas } from "@/lib/pdf";
import { createHash } from "node:crypto";
import { ehPLQuickbooks, mensagemMesConferido, payloadDemonstrativo, resumoCartaoPL, type CartaoPL } from "@/lib/consolidado";
import { gravarDemonstrativo } from "@/lib/demonstrativos-import";
import {
  AnexoError,
  BIBLIOTECA_LIMITES,
  anexoCabeNoTeto,
  chaveBase,
  chaveRascunho,
  chaveTipo,
  colunasSalvas,
  estimarTokensAnexo,
  prepararAnexo,
  resumoParaContexto,
  validarDocumento,
  type Anexo,
  type ColunaDoc,
  type FormatoDoc,
} from "@/lib/biblioteca";

export type PlanoTela = { id: string; titulo: string; descricao: string };
export type EntendimentoTela = Entendimento & { pedidoId: string; versao: number };
export type DocumentoTela = { id: string; titulo: string; explicacao: string; formato: FormatoDoc; colunas: ColunaDoc[]; frequencia?: string; uso?: string };
export type RespostaAssistente =
  | { ok: true; texto: string; plano?: PlanoTela; entendimento?: EntendimentoTela; documento?: DocumentoTela; demonstrativo?: CartaoPL; destino?: string; executadoEm?: string }
  | { ok: false; erro: string };

const TEXTO_DOCUMENTO = "Registrei meu entendimento do documento abaixo. É isso?";
const SO_CONSULTA_ANEXO = "Seu perfil só permite consultar. Anexar documentos é para analistas e administradores.";
const TEXTO_ENTENDIMENTO = "Registrei meu entendimento abaixo. Confirme se é isso — fica registrado para a equipe avaliar.";

const PERGUNTA_PADRAO = "O que é este documento?";
const MAX_PL_PAGINAS = 10;
const TEXTO_PL = "Este PDF é o Profit & Loss do QuickBooks. Confira o resumo abaixo e clique em Lançar no Consolidado; o mês entra como rascunho para você conferir. Vale por 10 minutos.";
const mesAno = (ano: number, mes: number) => `${new Date(Date.UTC(ano, mes - 1, 15)).toLocaleString("pt-BR", { month: "long", timeZone: "UTC" })} de ${ano}`;

const MAX_PERGUNTA = 1000;
const FALHA: Record<string, string> = {
  passos: "Não consegui terminar a resposta. Tente uma pergunta mais direta.",
  custo: "Não consegui terminar a resposta. Tente uma pergunta mais direta.",
  corte: "Minha resposta ficou longa demais e foi cortada. Tente de novo ou divida o pedido em partes menores.",
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

/** O que a troca produziu, para o registro da conversa. fim null = nada a registrar (sem pergunta). */
type RegistroTroca = {
  pergunta: string;
  fim: string | null;
  ferramentas: string[];
  passos: number;
  custoUsd: number;
  anexo: AnexoLog | null;
  pedidoId: string | null;
  documentoId: string | null;
  planoId: string | null;
};

/** Grava a troca (pergunta e resposta mostrada, mascaradas). Falha aqui nunca quebra a resposta. */
async function registrarConversa(s: Session, reg: RegistroTroca, r: RespostaAssistente) {
  if (!reg.fim || !reg.pergunta) return;
  try {
    const l = montarLogMensagem({ ...reg, fim: reg.fim, resposta: r.ok ? r.texto : r.erro });
    await db.assistantMessageLog.create({ data: { orgId: s.orgId, userId: s.userId, ...l, anexo: l.anexo ?? undefined } });
  } catch (e) {
    console.error(JSON.stringify({ evento: "assistente.registro_falhou", erro: e instanceof Error ? e.message.slice(0, 200) : "desconhecido" }));
  }
}

export async function enviarMensagem(form: FormData): Promise<RespostaAssistente> {
  const s = await requireSession();
  const reg: RegistroTroca = { pergunta: "", fim: null, ferramentas: [], passos: 0, custoUsd: 0, anexo: null, pedidoId: null, documentoId: null, planoId: null };
  const r = await processarMensagem(s, form, reg);
  await registrarConversa(s, reg, r);
  return r;
}

/** Cartão do P&L do QuickBooks já preparado (plano criado) nesta troca. */
type CartaoTroca = { plano: PlanoTela; demonstrativo: CartaoPL };

async function processarMensagem(s: Session, form: FormData, reg: RegistroTroca): Promise<RespostaAssistente> {
  const pre: { cartao: CartaoTroca | null } = { cartao: null };
  const r = await processarTroca(s, form, reg, pre);
  const c = pre.cartao;
  if (!c) return r;
  reg.fim = "pl_quickbooks";
  // A IA propôs outra ação nesta mesma troca: fica a dela (o plano do P&L expira sem uso)
  if (r.ok && r.plano && r.plano.id !== c.plano.id) return r;
  reg.planoId = c.plano.id;
  // A IA falhou ou não está configurada: o cartão continua valendo
  if (!r.ok) return { ok: true, texto: TEXTO_PL, plano: c.plano, demonstrativo: c.demonstrativo };
  return { ...r, plano: c.plano, demonstrativo: c.demonstrativo };
}

async function processarTroca(s: Session, form: FormData, reg: RegistroTroca, pre: { cartao: CartaoTroca | null }): Promise<RespostaAssistente> {
  const now = new Date();
  const arquivo = form.get("arquivo");
  const temArquivo = arquivo instanceof File && arquivo.size > 0;
  const digitada = String(form.get("mensagem") ?? "").trim();
  const pergunta = digitada || (temArquivo ? PERGUNTA_PADRAO : "");
  // Daqui em diante, toda saída antes da IA é uma recusa registrada
  reg.pergunta = pergunta;
  reg.fim = "recusado";
  const docRaw = temArquivo ? "" : String(form.get("documentoId") ?? "");
  if (docRaw && !ID_RE.test(docRaw)) return { ok: false, erro: "Documento não encontrado." };
  const operam = s.role === "ADMIN" || s.role === "ANALISTA";
  // Anexo e ajuste de documento: só quem opera
  if ((temArquivo || docRaw) && !operam) return { ok: false, erro: SO_CONSULTA_ANEXO };
  if (!pergunta) return { ok: false, erro: "Escreva sua pergunta." };
  if (pergunta.length > MAX_PERGUNTA) return { ok: false, erro: `A pergunta pode ter até ${MAX_PERGUNTA} caracteres.` };
  let bruto: unknown = [];
  try {
    bruto = JSON.parse(String(form.get("historico") ?? "[]").slice(0, 100_000));
  } catch {
    bruto = [];
  }
  const historico = limparHistorico(bruto);
  const pedidoRaw = String(form.get("pedidoId") ?? "");
  if (pedidoRaw && !ID_RE.test(pedidoRaw)) return { ok: false, erro: "Pedido não encontrado." };

  // Limite diário por pessoa (dia em Brasília): conta as mensagens registradas na auditoria
  const limite = msgsPorUsuarioDia();
  const usadas = await db.auditLog.count({ where: { orgId: s.orgId, userId: s.userId, action: "assistente.mensagem", createdAt: { gte: inicioDoDiaSP(diaSP(now)) } } });
  if (usadas >= limite) {
    await audit(s, "assistente.limite", `Limite diário por pessoa atingido (${limite} mensagens)`);
    return { ok: false, erro: `Você chegou ao limite de ${limite} mensagens do assistente por hoje. Volte amanhã.` };
  }

  // Arquivo lido antes da IA: o P&L do QuickBooks é reconhecido por regra, mesmo sem IA configurada
  let f: Awaited<ReturnType<typeof readUpload>> = null;
  let paginasPdf: number | undefined;
  if (temArquivo) {
    try {
      assertUploadTotal([arquivo]);
      f = await readUpload(arquivo, ["text", "xlsx", "pdf", "image"]);
    } catch (e) {
      if (e instanceof UploadError) return { ok: false, erro: e.message };
      throw e;
    }
    if (f && f.mime === "application/pdf" && !/\/Encrypt\b/.test(f.data.toString("latin1"))) {
      const n = await pdfPaginas(f.data);
      if (n === null) return { ok: false, erro: "Não consegui abrir o PDF. Ele pode estar protegido por senha ou corrompido; remova a senha ou gere o arquivo de novo." };
      paginasPdf = n;
      if (operam && n <= MAX_PL_PAGINAS) {
        const pl = ehPLQuickbooks(await pdfTextoPaginas(f.data));
        if (pl.tipo === "erro") return { ok: true, texto: pl.mensagem };
        if (pl.tipo === "ok") {
          const r = pl.pl;
          const existente = await db.demonstrativoPeriodo.findFirst({ where: { orgId: s.orgId, ano: r.ano, mes: r.mes }, select: { status: true } });
          if (existente?.status === "CONFERIDO") return { ok: true, texto: mensagemMesConferido(r.ano, r.mes) };
          const hash = createHash("sha256").update(f.data).digest("hex");
          const row = await db.assistantPlan.create({
            data: { orgId: s.orgId, userId: s.userId, acao: "importar_demonstrativo", payload: payloadDemonstrativo(r, hash), expiresAt: new Date(now.getTime() + PLANO_VALIDADE_MS) },
            select: { id: true },
          });
          const cartao = resumoCartaoPL(r);
          pre.cartao = {
            plano: { id: row.id, titulo: ROTULO_ACAO.importar_demonstrativo, descricao: `${cartao.empresa ? `${cartao.empresa} · ` : ""}${mesAno(r.ano, r.mes)}` },
            demonstrativo: cartao,
          };
          reg.planoId = row.id;
          reg.anexo = { formato: "PDF", paginas: n, bytes: f.data.length };
          // Sem texto da pessoa (ou só a pergunta padrão): responde com o cartão, sem IA
          if (!digitada || digitada === PERGUNTA_PADRAO) {
            await audit(s, "assistente.mensagem", `P&L do QuickBooks ${String(r.mes).padStart(2, "0")}/${r.ano} · plano ${row.id} · sem IA`);
            return { ok: true, texto: TEXTO_PL };
          }
        }
      }
    }
  }

  if (aiProvider() !== "claude") {
    if (temArquivo || docRaw) return { ok: false, erro: "Para ler documentos, a IA precisa estar configurada na instituição." };
    reg.fim = "sem_ia";
    await audit(s, "assistente.mensagem", "Sem IA: resposta pelo guia da plataforma");
    return { ok: true, texto: responderSemIa(pergunta) };
  }

  // Anexo: tipo conferido pelos bytes; planilha vira cabeçalho + amostra mascarada, PDF/imagem vão inteiros
  let anexo: Anexo | null = null;
  if (f) {
    try {
      anexo = await prepararAnexo(f, { paginas: paginasPdf });
      reg.anexo = { formato: anexo.formato, ...(anexo.paginas ? { paginas: anexo.paginas } : {}), bytes: f.data.length };
    } catch (e) {
      if (e instanceof UploadError || e instanceof AnexoError) return { ok: false, erro: e.message };
      throw e;
    }
  }
  // Ajuste: só o rascunho da própria pessoa, da mesma instituição, ainda válido. O arquivo não é reenviado.
  const rascunho = docRaw
    ? await db.documentoBiblioteca.findFirst({ where: { id: docRaw, orgId: s.orgId, criadoPor: s.userId, status: "RASCUNHO", expiresAt: { gt: now } } })
    : null;
  if (docRaw && !rascunho) return { ok: false, erro: "Este rascunho expirou ou não foi encontrado. Anexe o documento de novo." };
  if (rascunho) reg.documentoId = rascunho.id;

  // Pedido em andamento: só da mesma pessoa, da mesma instituição, ainda sem consenso
  const pedido =
    pedidoRaw && operam
      ? await db.featureRequest.findFirst({ where: { id: pedidoRaw, orgId: s.orgId, userId: s.userId, status: { not: "CONSENSO" } }, select: { id: true, versoes: true, transcricao: true } })
      : null;
  const atual = pedido ? versaoAtual(pedido.versoes) : null;
  if (pedido) reg.pedidoId = pedido.id;
  // A versão atual vai como dado não confiável na mensagem do usuário, nunca no system (o prefixo do cache fica fixo)
  let contexto = contextoSessao(s.name, s.role, now) + (atual ? `\nPedido em andamento, versão ${atual.n} (reescreva a versão inteira ao ajustar):\n${untrusted("pedido_atual", JSON.stringify(atual))}` : "");
  // Reconhecimento: planilha pela assinatura do cabeçalho; PDF/imagem comparados com até 30 resumos confirmados
  if (anexo?.assinatura) {
    const conhecido = await db.documentoBiblioteca.findFirst({ where: { orgId: s.orgId, chave: anexo.assinatura, status: "CONFIRMADO" } });
    if (conhecido) contexto += `\nEste documento já está na biblioteca da instituição:\n${resumoParaContexto([conhecido], "documento_conhecido")}`;
  } else if (anexo) {
    const docs = await db.documentoBiblioteca.findMany({
      where: { orgId: s.orgId, status: "CONFIRMADO", formato: { in: ["PDF", "IMAGEM"] } },
      orderBy: { updatedAt: "desc" },
      take: BIBLIOTECA_LIMITES.resumosContexto,
    });
    if (docs.length) contexto += `\nDocumentos já confirmados na biblioteca (diga se o anexo for um deles):\n${resumoParaContexto(docs)}`;
  }
  if (rascunho)
    contexto += `\nDocumento em ajuste (reescreva a versão inteira com registrar_documento):\n${untrusted(
      "documento_rascunho",
      JSON.stringify({ formato: rascunho.formato, titulo: rascunho.titulo, explicacao: rascunho.explicacao, cabecalho: rascunho.cabecalho, colunas: colunasSalvas(rascunho.colunas), frequencia: rascunho.frequencia, uso: rascunho.uso }),
      20_000,
    )}`;

  // Pré-checagem de custo: o anexo não pode estourar o teto por mensagem já no primeiro passo
  const anexoTokens = anexo ? estimarTokensAnexo(anexo) : 0;
  if (anexo && !anexoCabeNoTeto(anexoTokens, SYSTEM_ASSISTENTE.join("\n").length + contexto.length + pergunta.length + JSON.stringify(historico).length)) {
    await audit(s, "assistente.anexo_recusado", `Anexo ${anexo.formato} acima do teto de custo por mensagem (~${anexoTokens} tokens)`);
    return { ok: false, erro: "Este documento é grande demais para o assistente ler. Envie menos páginas ou um arquivo menor." };
  }

  const tools = toolsPara(s.role);
  const defs = tools.map(toolDef);
  // PDF/imagem: a reserva usa a estimativa por página/imagem em vez do tamanho do base64
  const call = meteredMessages(s.orgId, s.userId, { anexoTokens: anexo && anexo.formato !== "PLANILHA" ? anexoTokens : 0 });
  const r = await rodarLoop({
    call: (m) => call(requestBodyAssistente(SYSTEM_ASSISTENTE, defs, m)),
    executar: (nome, e) => executarConsulta(s.orgId, nome, e, now),
    tools,
    mensagens: montarMensagens(historico, pergunta, contexto, anexo?.blocos),
  });
  Object.assign(reg, { fim: r.fim, ferramentas: r.ferramentas, passos: r.passos, custoUsd: r.custoUsd });
  // Só metadados: nunca a pergunta, a resposta nem o conteúdo do anexo
  const meta = (anexo ? ` · anexo ${anexo.formato}${anexo.paginas ? ` (${anexo.paginas} pág.)` : ""}` : rascunho ? " · ajuste de documento" : "") + (pre.cartao ? ` · P&L do QuickBooks (plano ${pre.cartao.plano.id})` : "");
  await audit(s, "assistente.mensagem", `Passos ${r.passos} · ferramentas ${r.ferramentas.join(", ") || "nenhuma"} · custo US$ ${r.custoUsd.toFixed(4)} · fim ${r.fim}${meta}`.slice(0, 500));
  if (r.fim === "limite") await audit(s, "assistente.limite", "Teto diário de IA da instituição atingido");

  if (r.fim === "documento" && r.documento) {
    if (!operam) return { ok: true, texto: SO_CONSULTA_ANEXO };
    const formato = (anexo?.formato ?? rascunho?.formato) as FormatoDoc | undefined;
    if (!formato) return { ok: true, texto: "Anexe o documento para eu registrar o que ele significa." };
    const cabecalho = anexo ? (anexo.cabecalho ?? null) : Array.isArray(rascunho?.cabecalho) ? (rascunho.cabecalho as string[]) : null;
    const v = validarDocumento(r.documento, cabecalho);
    if (!v.ok) return { ok: true, texto: "Não consegui montar o entendimento do documento. Tente de novo." };
    const d = v.doc;
    const expiresAt = new Date(now.getTime() + BIBLIOTECA_LIMITES.rascunhoMs);
    const dados = { titulo: d.titulo, explicacao: d.explicacao, colunas: d.colunas, frequencia: d.frequencia ?? null, uso: d.uso ?? null, atualizadoPor: s.userId, expiresAt };
    let id: string;
    if (rascunho) {
      const up = await db.documentoBiblioteca.updateMany({ where: { id: rascunho.id, orgId: s.orgId, criadoPor: s.userId, status: "RASCUNHO" }, data: dados });
      if (up.count !== 1) return { ok: false, erro: "Este rascunho expirou ou não foi encontrado. Anexe o documento de novo." };
      id = rascunho.id;
    } else {
      // Rascunhos vencidos da instituição saem antes de criar o novo
      await db.documentoBiblioteca.deleteMany({ where: { orgId: s.orgId, status: "RASCUNHO", expiresAt: { lte: now } } });
      const base = formato === "PLANILHA" && anexo?.assinatura ? anexo.assinatura : chaveTipo(formato, d.tipo);
      const existente = await db.documentoBiblioteca.findFirst({ where: { orgId: s.orgId, chave: base }, select: { status: true, criadoPor: true } });
      // Chave já usada por outro registro (confirmado ou de outra pessoa): o rascunho fica separado até a confirmação
      const meu = existente?.status === "RASCUNHO" && existente.criadoPor === s.userId;
      const chave = existente && !meu ? chaveRascunho(base, s.userId) : base;
      const row = await db.documentoBiblioteca.upsert({
        where: { orgId_chave: { orgId: s.orgId, chave } },
        create: { orgId: s.orgId, formato, chave, status: "RASCUNHO", ...(cabecalho ? { cabecalho } : {}), criadoPor: s.userId, ...dados },
        update: { ...dados, ...(cabecalho ? { cabecalho } : {}) },
        select: { id: true, status: true, criadoPor: true },
      });
      if (row.status !== "RASCUNHO" || row.criadoPor !== s.userId) return { ok: false, erro: "Não consegui guardar o rascunho agora. Tente de novo." };
      id = row.id;
    }
    await audit(s, "documento.rascunho", `Documento ${id} · ${formato} · ${d.colunas.length} colunas`);
    reg.documentoId = id;
    const texto = (r.texto || TEXTO_DOCUMENTO).slice(0, 2000);
    return {
      ok: true,
      texto,
      documento: { id, formato, titulo: d.titulo, explicacao: d.explicacao, colunas: d.colunas, ...(d.frequencia ? { frequencia: d.frequencia } : {}), ...(d.uso ? { uso: d.uso } : {}) },
    };
  }

  if (r.fim === "plano" && r.plano) {
    if (s.role !== "ADMIN" && s.role !== "ANALISTA") return { ok: true, texto: "Seu perfil só permite consultar. Peça a um analista ou administrador." };
    const d = await descreverPlano(s, r.plano);
    if ("recusa" in d) return { ok: true, texto: d.recusa };
    const p = r.plano;
    const row = await db.assistantPlan.create({
      data: { orgId: s.orgId, userId: s.userId, acao: p.acao, payload: { alvo: p.alvo ?? null, motivo: p.motivo ?? null, resumo: p.resumo }, expiresAt: new Date(now.getTime() + PLANO_VALIDADE_MS) },
      select: { id: true },
    });
    reg.planoId = row.id;
    return { ok: true, texto: "Preparei a ação abaixo. Ela só acontece se você confirmar, em até 10 minutos.", plano: { id: row.id, titulo: ROTULO_ACAO[p.acao], descricao: d.descricao } };
  }
  if (r.fim === "entendimento" && r.entendimento) {
    if (!operam) return { ok: true, texto: "Seu perfil só permite consultar. Peça a um analista ou administrador." };
    const e = r.entendimento;
    // Só a pergunta e a resposta que passaram por esta action; o histórico do navegador não entra
    const troca = [
      { role: "user" as const, texto: pergunta },
      { role: "assistant" as const, texto: TEXTO_ENTENDIMENTO },
    ];
    let id: string;
    let versao: number;
    if (pedido) {
      const versoes = novaVersao(pedido.versoes, e, now);
      const up = await db.featureRequest.updateMany({
        where: { id: pedido.id, orgId: s.orgId, userId: s.userId, status: { not: "CONSENSO" } },
        data: { titulo: e.titulo, versoes, transcricao: anexarTranscricao(pedido.transcricao, troca, now), status: "AGUARDANDO_CONFIRMACAO" },
      });
      if (up.count !== 1) return { ok: false, erro: "Pedido não encontrado ou já confirmado." };
      id = pedido.id;
      versao = versoes.at(-1)!.n;
    } else {
      const versoes = novaVersao([], e, now);
      const row = await db.featureRequest.create({
        data: { orgId: s.orgId, userId: s.userId, titulo: e.titulo, status: "AGUARDANDO_CONFIRMACAO", versoes, transcricao: anexarTranscricao([], troca, now) },
        select: { id: true },
      });
      id = row.id;
      versao = versoes.at(-1)!.n;
    }
    await audit(s, "pedido.versao", `Pedido ${id} · versão ${versao}`);
    reg.pedidoId = id;
    return { ok: true, texto: TEXTO_ENTENDIMENTO, entendimento: { ...e, pedidoId: id, versao } };
  }
  const texto = (r.fim === "resposta" && r.texto ? r.texto : FALHA[r.fim] ?? FALHA.falha).slice(0, 2000);
  if (pedido) {
    // Conversa sobre o pedido: guarda a troca e volta para EM_CONVERSA até a próxima versão
    await db.featureRequest.updateMany({
      where: { id: pedido.id, orgId: s.orgId, userId: s.userId, status: { not: "CONSENSO" } },
      data: { transcricao: anexarTranscricao(pedido.transcricao, [{ role: "user", texto: pergunta }, { role: "assistant", texto }], now), status: "EM_CONVERSA" },
    });
  }
  return { ok: true, texto };
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

  if (plano.acao === "importar_demonstrativo") {
    const g = await gravarDemonstrativo(s, plano.pl, plano.hash, { viaAssistente: true });
    if (!g.ok) return { ok: false, erro: g.erro };
    await audit(s, "assistente.acao_confirmada", `importar_demonstrativo ${String(plano.pl.mes).padStart(2, "0")}/${plano.pl.ano} via assistente`);
    revalidatePath("/consolidado");
    return { ok: true, texto: `Lançado no Consolidado como rascunho. Abrindo ${mesAno(plano.pl.ano, plano.pl.mes)} para você conferir.`, destino: `/consolidado/${g.id}`, executadoEm: now.toISOString() };
  }
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
  return { ok: true, texto, executadoEm: now.toISOString() };
}

/** "Sim, é isso": promove o rascunho da própria pessoa a confirmado; um confirmado de mesma chave é substituído. */
export async function confirmarDocumento(id: string): Promise<RespostaAssistente> {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const now = new Date();
  const NAO = "Rascunho não encontrado ou expirado. Anexe o documento de novo.";
  if (typeof id !== "string" || !ID_RE.test(id)) return { ok: false, erro: NAO };
  const d = await db.documentoBiblioteca.findFirst({
    where: { id, orgId: s.orgId, criadoPor: s.userId, status: "RASCUNHO", expiresAt: { gt: now } },
    select: { id: true, chave: true, formato: true },
  });
  if (!d) return { ok: false, erro: NAO };
  const base = chaveBase(d.chave);
  let substituiu = 0;
  try {
    await db.$transaction(async (tx) => {
      const del = await tx.documentoBiblioteca.deleteMany({ where: { orgId: s.orgId, chave: base, id: { not: d.id } } });
      substituiu = del.count;
      const up = await tx.documentoBiblioteca.updateMany({
        where: { id: d.id, orgId: s.orgId, criadoPor: s.userId, status: "RASCUNHO", expiresAt: { gt: now } },
        data: { chave: base, status: "CONFIRMADO", expiresAt: null, atualizadoPor: s.userId },
      });
      if (up.count !== 1) throw new Error("rascunho mudou");
    });
  } catch {
    return { ok: false, erro: NAO };
  }
  await audit(s, "biblioteca.confirmar", `Documento ${d.id} · ${d.formato}${substituiu ? " · substituiu o registro anterior" : ""}`);
  revalidatePath("/biblioteca");
  return { ok: true, texto: "Salvo na biblioteca. Da próxima vez, reconheço este documento." };
}
