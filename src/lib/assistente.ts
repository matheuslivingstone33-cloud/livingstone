// Assistente da plataforma: ferramentas, validação de entrada e laço de chamadas. Puro: sem banco, sem Next, sem rede.
// A IA só consulta e explica. Ação nunca é executada aqui: propor_acao encerra o laço e devolve um plano,
// que só roda depois de a pessoa confirmar na tela (server action confirmarPlano).
import { ASSISTENTE, estimateCost, modelFor } from "./ai-config";
import { untrusted } from "./ai-prompt";
import type { ApiMessage, MessagesResult, MsgBlock, ToolDef } from "./ai";
import { GUIA_ASSISTENTE } from "./assistente-guia";
import { entendimentoDe, type Entendimento } from "./pedidos";
import { lerPayloadDemonstrativo } from "./consolidado";
import type { PlQuickbooks } from "./quickbooks-pl";

export type Papel = "ADMIN" | "ANALISTA" | "AUDITOR";
export type TipoTool = "consulta" | "acao" | "registro";
export type Acao = "gerar_proposta" | "pausar_regua" | "atualizar_resumo";
export const ACOES: Acao[] = ["gerar_proposta", "pausar_regua", "atualizar_resumo"];
/** Ações de plano criadas pelo sistema (nunca propostas pela IA): ficam fora de ACOES. */
export type AcaoSistema = "importar_demonstrativo";
export type AcaoPlano = Acao | AcaoSistema;
export const ROTULO_ACAO: Record<AcaoPlano, string> = {
  gerar_proposta: "Gerar proposta de acordo",
  pausar_regua: "Pausar a régua de cobrança",
  atualizar_resumo: "Atualizar o resumo do dia",
  importar_demonstrativo: "Lançar no Consolidado",
};

/** Ids do banco (cuid). */
export const ID_RE = /^[a-z0-9]{20,40}$/;

type Campo =
  | { tipo: "id"; obrigatorio?: boolean; descricao: string }
  | { tipo: "texto"; obrigatorio?: boolean; min: number; max: number; descricao: string }
  | { tipo: "inteiro"; obrigatorio?: boolean; min: number; max: number; descricao: string }
  | { tipo: "enum"; obrigatorio?: boolean; valores: readonly string[]; descricao: string };

export type ToolSpec = { nome: string; tipo: TipoTool; perfis: Papel[]; descricao: string; campos: Record<string, Campo> };

const TODOS: Papel[] = ["ADMIN", "ANALISTA", "AUDITOR"];
const OPERAM: Papel[] = ["ADMIN", "ANALISTA"];

/** Ferramentas em ordem fixa (a ordem entra no prefixo do cache). */
export const TOOLS: ToolSpec[] = [
  { nome: "consultar_painel", tipo: "consulta", perfis: TODOS, descricao: "Números do painel da instituição: PLD em análise, acordos vencendo, pendências da conciliação, dívida em aberto, pagamentos recentes e régua do mês.", campos: {} },
  {
    nome: "buscar_contrato",
    tipo: "consulta",
    perfis: TODOS,
    descricao: "Busca contratos de cobrança pelo número do contrato ou pelo nome do devedor. Devolve até 5, com id, situação, valor, vencimento, régua e último acordo.",
    campos: { termo: { tipo: "texto", obrigatorio: true, min: 2, max: 80, descricao: "Número do contrato ou parte do nome do devedor." } },
  },
  {
    nome: "casos_pld_vencendo",
    tipo: "consulta",
    perfis: TODOS,
    descricao: "Casos de PLD em análise com prazo dentro dos próximos dias (padrão 7), do mais urgente para o menos.",
    campos: { dias: { tipo: "inteiro", min: 1, max: 30, descricao: "Janela em dias, de 1 a 30." } },
  },
  {
    nome: "resultado_conciliacao",
    tipo: "consulta",
    perfis: TODOS,
    descricao: "Resultado de uma conciliação (a mais recente, se o id não for informado): contadores e frases das pendências.",
    campos: { id: { tipo: "id", descricao: "Id da conciliação (opcional)." } },
  },
  { nome: "uso_ia_hoje", tipo: "consulta", perfis: TODOS, descricao: "Gasto e chamadas de IA da instituição hoje, com o teto diário.", campos: {} },
  {
    nome: "propor_acao",
    tipo: "acao",
    perfis: OPERAM,
    descricao:
      "Propõe UMA ação para a pessoa confirmar na tela. Não executa nada. Use só quando a pessoa pedir a ação. gerar_proposta e pausar_regua exigem o id do contrato (alvo) obtido em buscar_contrato.",
    campos: {
      acao: { tipo: "enum", obrigatorio: true, valores: ACOES, descricao: "gerar_proposta | pausar_regua | atualizar_resumo" },
      alvo: { tipo: "id", descricao: "Id do contrato (gerar_proposta, pausar_regua)." },
      motivo: { tipo: "enum", valores: ["pausa", "opt_out"], descricao: "Só para pausar_regua: pausa ou opt_out (devedor pediu para não receber)." },
      resumo: { tipo: "texto", obrigatorio: true, min: 1, max: 200, descricao: "Uma frase dizendo o que será feito." },
    },
  },
  {
    nome: "registrar_entendimento",
    tipo: "registro",
    perfis: OPERAM,
    descricao:
      "Registra o seu entendimento de uma necessidade nova que a pessoa descreveu, para ela confirmar na tela. Não implementa nada. Sempre envie a versão inteira, reescrita.",
    campos: {
      titulo: { tipo: "texto", obrigatorio: true, min: 3, max: 80, descricao: "Título curto da necessidade." },
      problema: { tipo: "texto", obrigatorio: true, min: 1, max: 600, descricao: "Qual problema a pessoa quer resolver." },
      diaADia: { tipo: "texto", obrigatorio: true, min: 1, max: 600, descricao: "Como isso seria usado no dia a dia." },
      jaExiste: { tipo: "texto", obrigatorio: true, min: 1, max: 600, descricao: "O que a plataforma já tem sobre isso, só com base no guia." },
      novo: { tipo: "texto", obrigatorio: true, min: 1, max: 600, descricao: "O que seria novo." },
    },
  },
  {
    nome: "registrar_documento",
    tipo: "registro",
    perfis: OPERAM,
    descricao:
      "Registra o seu entendimento de um documento anexado (o que é e o que cada coluna significa), para a pessoa confirmar na tela e salvar na biblioteca. Não salva nada sozinho. Sempre envie a versão inteira, reescrita.",
    campos: {
      titulo: { tipo: "texto", obrigatorio: true, min: 3, max: 80, descricao: "Nome curto do documento (ex.: Extrato do banco em planilha)." },
      explicacao: { tipo: "texto", obrigatorio: true, min: 1, max: 600, descricao: "O que é o documento, em até 4 frases." },
      tipo: { tipo: "texto", obrigatorio: true, min: 2, max: 60, descricao: "Tipo do documento em poucas palavras, sempre o mesmo para o mesmo tipo (ex.: extrato bancario)." },
      colunas: {
        tipo: "texto",
        min: 2,
        max: 8000,
        descricao: 'JSON com a lista de colunas e o significado: [{"nome": "nome exato da coluna", "significado": "..."}]. Para PDF ou imagem, os campos principais.',
      },
      frequencia: { tipo: "texto", min: 1, max: 80, descricao: "Com que frequência o documento chega (se a pessoa disse)." },
      uso: { tipo: "texto", min: 1, max: 300, descricao: "Para que a instituição usa o documento na plataforma." },
    },
  },
];

const schemaDe = (c: Campo): Record<string, unknown> => {
  if (c.tipo === "id") return { type: "string", pattern: ID_RE.source, description: c.descricao };
  if (c.tipo === "texto") return { type: "string", minLength: c.min, maxLength: c.max, description: c.descricao };
  if (c.tipo === "inteiro") return { type: "integer", minimum: c.min, maximum: c.max, description: c.descricao };
  return { type: "string", enum: [...c.valores], description: c.descricao };
};

export const toolDef = (t: ToolSpec): ToolDef => ({
  name: t.nome,
  description: t.descricao,
  input_schema: {
    type: "object",
    properties: Object.fromEntries(Object.entries(t.campos).map(([k, c]) => [k, schemaDe(c)])),
    required: Object.entries(t.campos).filter(([, c]) => c.obrigatorio).map(([k]) => k),
    additionalProperties: false,
  },
});

/** Ferramentas que o perfil pode ver. Auditor só vê consultas. Perfil desconhecido não vê nada. */
export function toolsPara(role: string): ToolSpec[] {
  return TOOLS.filter((t) => (t.perfis as string[]).includes(role) && (role !== "AUDITOR" || t.tipo === "consulta"));
}

export type Entrada = Record<string, string | number>;
export type Validacao = { ok: true; valor: Entrada } | { ok: false; erro: string };

/** Confere a entrada de uma ferramenta contra a especificação. Campo fora da lista (ex.: orgId) é recusado. */
export function validarEntrada(nome: string, input: unknown, tools: ToolSpec[] = TOOLS): Validacao {
  const t = tools.find((x) => x.nome === nome);
  if (!t) return { ok: false, erro: `ferramenta indisponível: ${String(nome).slice(0, 40)}` };
  if (input === undefined || input === null) input = {};
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, erro: "entrada precisa ser um objeto" };
  const o = input as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (/^org/i.test(k)) return { ok: false, erro: "a instituição vem da sessão, não da entrada" };
    if (!(k in t.campos)) return { ok: false, erro: `campo não permitido: ${k.slice(0, 40)}` };
  }
  const valor: Entrada = {};
  for (const [k, c] of Object.entries(t.campos)) {
    const v = o[k];
    if (v === undefined || v === null || v === "") {
      if (c.obrigatorio) return { ok: false, erro: `campo obrigatório: ${k}` };
      continue;
    }
    if (c.tipo === "id") {
      if (typeof v !== "string" || !ID_RE.test(v)) return { ok: false, erro: `${k} inválido` };
    } else if (c.tipo === "texto") {
      if (typeof v !== "string" || v.trim().length < c.min || v.length > c.max) return { ok: false, erro: `${k} inválido` };
    } else if (c.tipo === "inteiro") {
      if (typeof v !== "number" || !Number.isInteger(v) || v < c.min || v > c.max) return { ok: false, erro: `${k} inválido` };
    } else if (typeof v !== "string" || !c.valores.includes(v)) return { ok: false, erro: `${k} inválido` };
    valor[k] = typeof v === "string" ? v.trim() : v;
  }
  return { ok: true, valor };
}

export type Plano = { acao: Acao; alvo?: string; motivo?: "pausa" | "opt_out"; resumo: string };

/** Entrada já validada de propor_acao → plano coerente (alvo exigido onde precisa). */
export function planoDe(v: Entrada): { ok: true; plano: Plano } | { ok: false; erro: string } {
  const acao = v.acao as Acao;
  const resumo = String(v.resumo ?? "").slice(0, 200);
  if (acao === "atualizar_resumo") return { ok: true, plano: { acao, resumo } };
  if (typeof v.alvo !== "string") return { ok: false, erro: "alvo obrigatório para esta ação (use buscar_contrato)" };
  if (acao === "pausar_regua") return { ok: true, plano: { acao, alvo: v.alvo, motivo: v.motivo === "opt_out" ? "opt_out" : "pausa", resumo } };
  return { ok: true, plano: { acao, alvo: v.alvo, resumo } };
}

// ---------- Prompt ----------

const INSTRUCOES = [
  "Você é o assistente da Livingstone, plataforma de operações para cooperativas de crédito, financeiras e fintechs.",
  "Responda em português do Brasil, em até 4 frases curtas e simples, sem markdown, sem tabelas e sem HTML.",
  "Explique como usar a plataforma com base no guia abaixo. Para números da instituição, use as ferramentas de consulta; nunca invente valores, datas, nomes ou contratos.",
  "Você não decide nada que o sistema decide por regra (desconto, score, risco, conciliação): só explica o resultado.",
  "Ações: só existem gerar proposta de um contrato, pausar a régua de um contrato e atualizar o resumo do dia. Use propor_acao apenas quando a pessoa pedir, e diga que ela precisa confirmar no cartão. Nunca diga que a ação já foi feita.",
  "Se a ferramenta propor_acao não estiver disponível, diga que o perfil da pessoa só permite consultar.",
  "Quando a resposta tiver números, escreva cada número em uma linha própria no formato Rótulo: valor (ex.: Dívida em aberto: R$ 12.345,67 ou PLD em análise: 4), com rótulo curto e só o número depois dos dois-pontos.",
  "Se não souber ou a ferramenta não trouxer o dado, diga isso e indique a tela certa.",
  "Pedidos: quando a pessoa descrever uma necessidade que a plataforma não atende, faça no máximo 2 perguntas curtas e então use registrar_entendimento com problema, uso no dia a dia, o que já existe e o que seria novo.",
  "Em jaExiste, cite só o que está no guia abaixo. Se o guia não tiver nada, diga que não há nada parecido hoje.",
  "NUNCA prometa entrega, prazo ou que a funcionalidade será feita; diga apenas que fica registrado para a equipe avaliar.",
  "Quando a pessoa pedir ajuste, pergunte o que mudar se ela não disse e então chame registrar_entendimento de novo com a versão inteira reescrita, não só o trecho alterado.",
  "No registro, não copie CPF, CNPJ, nomes de pessoas ou valores reais: descreva de forma genérica.",
  "Se a ferramenta registrar_entendimento não estiver disponível, diga que o perfil da pessoa só permite consultar.",
  "Documentos anexados: explique o que é o documento em até 4 frases, sem copiar dados pessoais, e chame registrar_documento com título, explicação, tipo e o significado de cada coluna, usando os nomes exatos do cabeçalho. Termine perguntando: É isso?",
  "Os valores da amostra de planilha estão mascarados (dígitos viram 9 e letras viram a); use os nomes das colunas e a forma dos valores.",
  "Se o contexto disser que o documento já está na biblioteca, diga que ele já é conhecido e use o significado salvo; só registre de novo se a pessoa pedir ajuste.",
  "Se a pessoa pedir um uso do documento que a plataforma não tem, diga isso e use registrar_entendimento para registrar a necessidade.",
  "Quando a pessoa pedir ajuste do documento, chame registrar_documento de novo com a versão inteira reescrita.",
].join("\n");

/** Blocos do system: fixos para todas as chamadas (sem nome, data ou perfil). */
export const SYSTEM_ASSISTENTE: string[] = [INSTRUCOES, `Guia da plataforma:\n${GUIA_ASSISTENTE}`];

const DATA_BR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/** Contexto variável da sessão, enviado na primeira mensagem do usuário. */
export function contextoSessao(nome: string, role: string, now: Date): string {
  const n = String(nome ?? "").replace(/[<>\n\r]/g, " ").slice(0, 80);
  const perfil = role === "ADMIN" ? "Administrador" : role === "ANALISTA" ? "Analista" : "Auditor (só consulta)";
  return `Contexto da sessão: pessoa ${n}, perfil ${perfil}, hoje ${DATA_BR.format(now)}.`;
}

export type MsgCliente = { role: "user" | "assistant"; texto: string };

/**
 * Histórico vindo do navegador: só texto de user/assistant. Blocos (tool_use, tool_result) e papéis
 * desconhecidos são descartados; fica com as últimas mensagens dentro do limite de caracteres.
 */
export function limparHistorico(raw: unknown, lim = { msgs: ASSISTENTE.historicoMsgs, chars: ASSISTENTE.historicoChars }): MsgCliente[] {
  if (!Array.isArray(raw)) return [];
  const ok = raw
    .filter((m): m is { role: "user" | "assistant"; texto: string } => !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.texto === "string" && m.texto.trim().length > 0)
    .map((m) => ({ role: m.role, texto: m.texto.slice(0, lim.chars) }))
    .slice(-lim.msgs);
  const out: MsgCliente[] = [];
  let total = 0;
  for (let i = ok.length - 1; i >= 0; i--) {
    total += ok[i].texto.length;
    if (total > lim.chars) break;
    out.unshift(ok[i]);
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** Mensagens para a API: contexto + histórico limpo + pergunta nova, com papéis alternados. */
export function montarMensagens(historico: MsgCliente[], pergunta: string, contexto: string, anexo?: MsgBlock[]): ApiMessage[] {
  const seq: MsgCliente[] = [...historico, { role: "user", texto: pergunta }];
  const out: { role: "user" | "assistant"; textos: string[] }[] = [];
  for (const m of seq) {
    const ult = out[out.length - 1];
    if (ult && ult.role === m.role) ult.textos.push(m.texto);
    else out.push({ role: m.role, textos: [m.texto] });
  }
  return out.map((m, i) => {
    const textos = [...(i === 0 ? [contexto] : []), ...m.textos].map((text): MsgBlock => ({ type: "text", text }));
    // Anexo: entra na última mensagem do usuário, logo antes da pergunta
    if (anexo?.length && i === out.length - 1) textos.splice(textos.length - 1, 0, ...anexo);
    return { role: m.role, content: textos };
  });
}

// ---------- Laço ----------

export type FimLoop = "resposta" | "plano" | "entendimento" | "documento" | "passos" | "custo" | "falha" | "limite" | "corte";
export type ResultadoLoop = { fim: FimLoop; texto: string; plano?: Plano; entendimento?: Entendimento; documento?: Entrada; passos: number; ferramentas: string[]; custoUsd: number; detalhe?: string };
export type Executar = (nome: string, entrada: Entrada) => Promise<unknown>;

const textoDe = (content: MsgBlock[]) =>
  content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();

const resultado = (id: string, content: string, erro = false): MsgBlock => ({ type: "tool_result", tool_use_id: id, content, ...(erro ? { is_error: true } : {}) });

/**
 * Laço de ferramentas. Para em: resposta final, propor_acao válida (sem executar), limite de passos,
 * teto de custo por mensagem ou falha da IA. O conteúdo do assistente é anexado sem alteração;
 * o resultado de cada ferramenta volta como dado não confiável, cortado em toolResultChars.
 */
export async function rodarLoop(o: {
  call: (mensagens: ApiMessage[]) => Promise<MessagesResult>;
  executar: Executar;
  tools: ToolSpec[];
  mensagens: ApiMessage[];
  max?: number;
  custoMax?: number;
  toolResultChars?: number;
}): Promise<ResultadoLoop> {
  const max = o.max ?? ASSISTENTE.passos;
  const custoMax = o.custoMax ?? ASSISTENTE.custoMaxUsdPorMensagem;
  const corte = o.toolResultChars ?? ASSISTENTE.toolResultChars;
  const msgs: ApiMessage[] = [...o.mensagens];
  const ferramentas: string[] = [];
  let custo = 0;
  let ultimoTexto = "";
  const fim = (f: FimLoop, passos: number, extra: Partial<ResultadoLoop> = {}): ResultadoLoop => ({ fim: f, texto: ultimoTexto, passos, ferramentas, custoUsd: Math.round(custo * 1e6) / 1e6, ...extra });

  for (let passo = 0; passo < max; passo++) {
    if (custo >= custoMax) return fim("custo", passo);
    const r = await o.call(msgs);
    if (r.usage) custo += estimateCost(r.model ?? modelFor("assistente"), r.usage);
    if (!r.ok) return fim(r.reason === "limite" ? "limite" : "falha", passo + 1, { detalhe: r.detail });
    msgs.push({ role: "assistant", content: r.content });
    const t = textoDe(r.content);
    if (t) ultimoTexto = t;
    const usos = r.content.filter((b) => b.type === "tool_use");
    // Cortada no limite de tamanho: ferramenta incompleta não vale e texto parcial não é resposta
    if (r.stop_reason === "max_tokens") return fim("corte", passo + 1);
    if (r.stop_reason !== "tool_use" || !usos.length) return fim("resposta", passo + 1);

    const resultados: MsgBlock[] = [];
    for (const u of usos) {
      const id = String(u.id ?? "");
      const nome = String(u.name ?? "");
      ferramentas.push(nome.slice(0, 40));
      const v = validarEntrada(nome, u.input, o.tools);
      if (!v.ok) {
        resultados.push(resultado(id, `Erro: ${v.erro}`, true));
        continue;
      }
      const spec = o.tools.find((x) => x.nome === nome)!;
      // Registro: encerra sem executar; a action salva e a pessoa confirma na tela
      if (spec.tipo === "registro" && nome === "registrar_documento") return fim("documento", passo + 1, { documento: v.valor });
      if (spec.tipo === "registro") return fim("entendimento", passo + 1, { entendimento: entendimentoDe(v.valor) });
      if (spec.tipo === "acao") {
        const p = planoDe(v.valor);
        if (!p.ok) {
          resultados.push(resultado(id, `Erro: ${p.erro}`, true));
          continue;
        }
        // Proposta: encerra sem executar; a execução depende da confirmação humana
        return fim("plano", passo + 1, { plano: p.plano });
      }
      let dado: unknown;
      try {
        dado = await o.executar(nome, v.valor);
      } catch {
        resultados.push(resultado(id, "Erro: consulta indisponível agora", true));
        continue;
      }
      const json = typeof dado === "string" ? dado : JSON.stringify(dado ?? null);
      resultados.push(resultado(id, untrusted("resultado_ferramenta", json.slice(0, corte))));
    }
    msgs.push({ role: "user", content: resultados });
  }
  return fim("passos", max);
}

// ---------- Confirmação do plano ----------

export const PLANO_VALIDADE_MS = 10 * 60_000;
export type DecisaoPlano = "ok" | "nao_encontrado" | "outro_usuario" | "usado" | "expirado";

/** Só a mesma pessoa, da mesma instituição, uma vez, dentro do prazo. */
export function decidirPlano(
  p: { orgId: string; userId: string; status: string; expiresAt: Date } | null,
  s: { orgId: string; userId: string },
  now: Date,
): DecisaoPlano {
  if (!p || p.orgId !== s.orgId) return "nao_encontrado";
  if (p.userId !== s.userId) return "outro_usuario";
  if (p.status !== "PENDENTE") return "usado";
  if (p.expiresAt.getTime() <= now.getTime()) return "expirado";
  return "ok";
}

/** Plano do P&L anexado: a árvore já lida e o hash do PDF (o PDF não é guardado). */
export type PlanoDemonstrativo = { acao: "importar_demonstrativo"; pl: PlQuickbooks; hash: string };
export type PlanoSalvo = Plano | PlanoDemonstrativo;

/** Payload salvo no banco → plano (ou null se adulterado). */
export function lerPlano(acao: string, payload: unknown): PlanoSalvo | null {
  if (acao === "importar_demonstrativo") {
    const d = lerPayloadDemonstrativo(payload);
    return d ? { acao, ...d } : null;
  }
  if (!ACOES.includes(acao as Acao) || !payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const v = validarEntrada("propor_acao", { acao, alvo: o.alvo, motivo: o.motivo, resumo: o.resumo || "-" });
  if (!v.ok) return null;
  const p = planoDe(v.valor);
  return p.ok ? p.plano : null;
}
