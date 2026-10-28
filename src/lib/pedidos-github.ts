// Esteira pedido -> issue no GitHub. Puro: sem banco, sem Next, sem rede.
import { UNTRUSTED_RULE, untrusted } from "./ai-prompt";
import { mascararDocs } from "./mascara";

/** Tempo em que uma tentativa de criar a issue "segura" o pedido (evita duplicar em cliques/execuções simultâneas). */
export const LEASE_ISSUE_MS = 2 * 60 * 1000;
/** Corte do prompt no corpo da issue (o GitHub aceita até 65.536 caracteres no corpo). */
export const MAX_PROMPT_ISSUE = 60_000;
export const LABELS_ISSUE = ["pedido", "claude"] as const;

const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const ZW = "​";

export type ConfigGithub = { token: string; repo: string };

/** Lê GITHUB_TOKEN_PEDIDOS e GITHUB_REPO_PEDIDOS ("dono/repo"). Faltando ou inválido: null (integração desligada). */
export function configGithub(env: Record<string, string | undefined>): ConfigGithub | null {
  const token = env.GITHUB_TOKEN_PEDIDOS?.trim();
  const repo = env.GITHUB_REPO_PEDIDOS?.trim();
  if (!token || !repo || !REPO_RE.test(repo) || repo.split("/")[1].startsWith(".")) return null;
  return { token, repo };
}

/** Impede menções (@pessoa) e referências (#123) de disparar notificações ou vínculos no GitHub. */
export function neutralizarGithub(s: string): string {
  return s.replace(/@(?=[A-Za-z0-9_-])/g, `@${ZW}`).replace(/#(?=\d)/g, `#${ZW}`);
}

export function tituloIssue(p: { titulo: string }): string {
  const t = neutralizarGithub(mascararDocs(String(p.titulo ?? "")).replace(/\s+/g, " ").trim()).slice(0, 200);
  return `Pedido: ${t || "sem título"}`;
}

/** Cerca de crases maior que a maior sequência de crases do texto (no mínimo 3). */
export function cerca(texto: string): string {
  const maior = Math.max(0, ...(texto.match(/`+/g) ?? []).map((m) => m.length));
  return "`".repeat(Math.max(3, maior + 1));
}

/** Corpo da issue: regra de dado não confiável, link do pedido, ID e o prompt mascarado dentro de uma cerca. Determinístico. */
export function corpoIssue(p: { id: string; prompt: string }, appUrl: string): string {
  const base = appUrl.replace(/\/+$/, "");
  const dado = untrusted("pedido", neutralizarGithub(mascararDocs(String(p.prompt ?? "").slice(0, MAX_PROMPT_ISSUE))), MAX_PROMPT_ISSUE + 1000);
  const f = cerca(dado);
  return [
    `> ${UNTRUSTED_RULE}`,
    "",
    `Pedido: ${base}/pedidos/${p.id}`,
    `Pedido-ID: ${p.id}`,
    "",
    f,
    dado,
    f,
  ].join("\n");
}

/** Pode tentar criar a issue: pedido em CONSENSO, com prompt, sem issue e sem tentativa nos últimos 2 minutos. */
export function podeCriarIssue(p: { status: string; prompt: string | null; issueNumber: number | null; issueTentativaEm: Date | null }, now: Date): boolean {
  if (p.status !== "CONSENSO" || !p.prompt || p.issueNumber != null) return false;
  return !p.issueTentativaEm || now.getTime() - p.issueTentativaEm.getTime() >= LEASE_ISSUE_MS;
}

/** Tentativas anteriores a este instante já expiraram. */
export const leaseExpiradoAntesDe = (now: Date) => new Date(now.getTime() - LEASE_ISSUE_MS);

export function payloadIssue(p: { id: string; titulo: string; prompt: string }, appUrl: string) {
  return { title: tituloIssue(p), body: corpoIssue(p, appUrl), labels: [...LABELS_ISSUE] };
}

/** Valida a resposta da API: número inteiro positivo e URL da issue exatamente neste repositório. */
export function resultadoIssue(json: unknown, repo: string): { number: number; url: string } | null {
  if (!json || typeof json !== "object") return null;
  const { number, html_url } = json as { number?: unknown; html_url?: unknown };
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || typeof html_url !== "string") return null;
  if (html_url.toLowerCase() !== `https://github.com/${repo}/issues/${number}`.toLowerCase()) return null;
  return { number, url: html_url };
}

/** Mensagem de erro curta para gravar no pedido: sem o token nem nada que pareça token do GitHub. */
export function erroCurto(e: unknown, token?: string): string {
  let m = e instanceof Error ? e.message : typeof e === "string" ? e : "Erro desconhecido";
  if (token) m = m.split(token).join("***");
  m = m.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,})/g, "***").replace(/\s+/g, " ").trim();
  return (m || "Erro desconhecido").slice(0, 300);
}
