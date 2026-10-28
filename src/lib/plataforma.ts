// Operador da plataforma: leitura entre instituições (cross-org), só leitura e sempre auditada. Puro: sem banco nem Next.

/** Usado quando a variável de ambiente está ausente (undefined). Vazia = ninguém. */
export const OPERADORES_PADRAO = "matheuslivingstone33@gmail.com";

const ID_ORG = /^[a-z0-9]{20,40}$/;

/** E-mails de operadores, normalizados. env ausente usa o padrão; env vazia dá lista vazia. */
export function listaOperadores(env: string | undefined): string[] {
  return (env === undefined ? OPERADORES_PADRAO : env)
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

/** Comparação exata do e-mail inteiro (sem diferenciar maiúsculas e ignorando espaços nas pontas). */
export function ehOperador(email: string | null | undefined, env: string | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return !!e && listaOperadores(env).includes(e);
}

/**
 * Filtro de leitura do Prisma. Quem não é operador vê sempre a própria instituição.
 * Operador: uma instituição específica se o filtro for um ID válido; senão todas ({}).
 */
export function escopoLeitura(p: { orgIdSessao: string; operador: boolean; orgFiltro?: string | null }): { orgId?: string } {
  if (!p.operador) return { orgId: p.orgIdSessao };
  return typeof p.orgFiltro === "string" && ID_ORG.test(p.orgFiltro) ? { orgId: p.orgFiltro } : {};
}
