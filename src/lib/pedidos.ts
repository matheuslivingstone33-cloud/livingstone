// Pedidos de funcionalidade feitos no assistente: versões do entendimento, transcrição e prompt para a equipe.
// Puro: sem banco, sem Next, sem IA. Tudo o que entra é normalizado e tem CPF/CNPJ mascarados.
import { mascararDocs } from "./mascara";

export type StatusPedido = "EM_CONVERSA" | "AGUARDANDO_CONFIRMACAO" | "CONSENSO";
export const ROTULO_STATUS: Record<StatusPedido, string> = {
  EM_CONVERSA: "Em conversa",
  AGUARDANDO_CONFIRMACAO: "Aguardando confirmação",
  CONSENSO: "Consenso",
};

export type Entendimento = { titulo: string; problema: string; diaADia: string; jaExiste: string; novo: string };
export type Versao = Entendimento & { n: number; em: string };
export type ItemTranscricao = { role: "user" | "assistant"; texto: string; em: string };

export const PEDIDOS_LIMITES = { titulo: 80, campo: 600, versoes: 20, transcricao: 200, item: 2000 } as const;
export const PEDIDOS_VIEWERS_PADRAO = "matheuslivingstone33@gmail.com";

const CAMPOS = ["problema", "diaADia", "jaExiste", "novo"] as const;

/** Texto livre → uma linha limpa: sem caracteres de controle, espaços colapsados, CPF/CNPJ mascarados, cortado no limite. */
const limpar = (v: unknown, max: number): string =>
  mascararDocs(
    String(v ?? "")
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  ).slice(0, max);

/** Entrada (já validada) de registrar_entendimento → entendimento normalizado e mascarado. */
export function entendimentoDe(v: Record<string, unknown>): Entendimento {
  const o = v && typeof v === "object" ? v : {};
  return {
    titulo: limpar(o.titulo, PEDIDOS_LIMITES.titulo).replace(/\s+/g, " "),
    problema: limpar(o.problema, PEDIDOS_LIMITES.campo),
    diaADia: limpar(o.diaADia, PEDIDOS_LIMITES.campo),
    jaExiste: limpar(o.jaExiste, PEDIDOS_LIMITES.campo),
    novo: limpar(o.novo, PEDIDOS_LIMITES.campo),
  };
}

/** Versões salvas no banco → lista válida (itens adulterados são descartados). */
export function lerVersoes(raw: unknown): Versao[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    .filter((x) => Number.isInteger(x.n) && (x.n as number) > 0 && typeof x.titulo === "string" && typeof x.em === "string" && CAMPOS.every((c) => typeof x[c] === "string"))
    .map((x) => ({ ...entendimentoDe(x), n: x.n as number, em: String(x.em).slice(0, 40) }));
}

/** Acrescenta a versão N+1 (N = maior número salvo). Guarda só as últimas PEDIDOS_LIMITES.versoes. */
export function novaVersao(versoes: unknown, e: Entendimento, now: Date): Versao[] {
  const atuais = lerVersoes(versoes);
  const n = atuais.reduce((m, v) => Math.max(m, v.n), 0) + 1;
  return [...atuais, { ...entendimentoDe(e), n, em: now.toISOString() }].slice(-PEDIDOS_LIMITES.versoes);
}

export const versaoAtual = (versoes: unknown): Versao | null => lerVersoes(versoes).at(-1) ?? null;

/** Transcrição salva → lista válida. */
export function lerTranscricao(raw: unknown): ItemTranscricao[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is ItemTranscricao => !!x && typeof x === "object" && (x.role === "user" || x.role === "assistant") && typeof x.texto === "string" && typeof x.em === "string")
    .map((x) => ({ role: x.role, texto: x.texto.slice(0, PEDIDOS_LIMITES.item), em: x.em.slice(0, 40) }));
}

/** Anexa mensagens à transcrição: mascara, corta cada item e mantém as últimas PEDIDOS_LIMITES.transcricao. */
export function anexarTranscricao(atual: unknown, msgs: { role: "user" | "assistant"; texto: string }[], now: Date): ItemTranscricao[] {
  const novos = msgs
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.texto === "string" && m.texto.trim())
    .map((m) => ({ role: m.role, texto: mascararDocs(m.texto.trim()).slice(0, PEDIDOS_LIMITES.item), em: now.toISOString() }));
  return [...lerTranscricao(atual), ...novos].slice(-PEDIDOS_LIMITES.transcricao);
}

const DATA_BR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/** Prompt pronto para implementação, montado só da versão confirmada. Determinístico: mesma entrada, mesmo texto. */
export function montarPrompt(p: { titulo: string; versao: Entendimento & { n: number } }, now: Date): string {
  const v = entendimentoDe(p.versao);
  const titulo = limpar(p.titulo, PEDIDOS_LIMITES.titulo).replace(/\s+/g, " ") || v.titulo;
  return [
    `# Pedido: ${titulo}`,
    `Versão ${p.versao.n} confirmada em ${DATA_BR.format(now)}. Registro para a equipe avaliar; não é compromisso de entrega.`,
    "",
    "## Problema",
    v.problema || "-",
    "",
    "## Uso no dia a dia",
    v.diaADia || "-",
    "",
    "## O que já existe na plataforma",
    v.jaExiste || "-",
    "",
    "## O que seria novo",
    v.novo || "-",
    "",
    "## Restrições do projeto",
    "- Siga a ordem: lógica pura em src/lib/<modulo>.ts → testes em tests/modulos.test.mts → server action fina em src/app/actions-<modulo>.ts → página por último.",
    "- Toda consulta por ID filtra pelo orgId da sessão; nunca só pelo ID.",
    "- Escritas exigem ADMIN ou ANALISTA; AUDITOR só lê.",
    "- Ações relevantes gravam auditoria (audit / auditRaw), só com metadados.",
    "- Não atribua à IA decisões que o produto define por regra determinística.",
    "- Antes de editar, confirme o que já existe e passe o plano pelo agente arquiteto.",
  ].join("\n");
}

/** Quem vê /pedidos: e-mails em PEDIDOS_VIEWERS (vírgula), comparação exata sem caixa. Sem a variável, o padrão; vazia, ninguém. */
export function podeVerPedidos(email: string | null | undefined, env: string | undefined): boolean {
  if (!email) return false;
  const lista = (env === undefined ? PEDIDOS_VIEWERS_PADRAO : env)
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes(email.trim().toLowerCase());
}

const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  EM_CONVERSA: ["AGUARDANDO_CONFIRMACAO"],
  AGUARDANDO_CONFIRMACAO: ["EM_CONVERSA", "CONSENSO"],
  CONSENSO: [],
};

/** CONSENSO é final. */
export function podeTransicionar(de: string, para: string): boolean {
  return Object.hasOwn(TRANSICOES, de) && TRANSICOES[de as StatusPedido].includes(para as StatusPedido);
}
