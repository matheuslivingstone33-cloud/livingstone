// Registro das conversas do assistente. Puro: sem banco nem Next; só depende da máscara.
import { mascararDocs } from "./mascara";

// Mesmo formato de ID de src/lib/assistente.ts (copiado para não puxar a IA para cá)
const ID_RE = /^[a-z0-9]{20,40}$/;
const FERRAMENTA_RE = /^[a-z_]{1,40}$/;
const FIM_RE = /^[a-z_]{1,20}$/;

export const CONVERSAS_LIMITES = { pergunta: 4000, resposta: 8000, ferramentas: 20, diasRetencao: 180, pagina: 100 } as const;

// Caracteres de controle, exceto tab e quebra de linha
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const texto = (v: unknown, max: number) => mascararDocs(String(v ?? "").replace(CONTROLE, "")).slice(0, max);
const idOuNull = (v: unknown) => (typeof v === "string" && ID_RE.test(v) ? v : null);
const inteiro = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);

export type AnexoLog = { formato: string; paginas?: number; bytes?: number };

export type EntradaLog = {
  pergunta: string;
  resposta: string;
  fim: string;
  ferramentas?: unknown;
  passos?: unknown;
  custoUsd?: unknown;
  anexo?: unknown;
  pedidoId?: unknown;
  documentoId?: unknown;
  planoId?: unknown;
};

export type LogMensagem = {
  pergunta: string;
  resposta: string;
  fim: string;
  ferramentas: string[];
  passos: number;
  custoUsd: number;
  anexo: AnexoLog | null;
  pedidoId: string | null;
  documentoId: string | null;
  planoId: string | null;
};

/** Do anexo só ficam formato, páginas e bytes; conteúdo, nome e blocos são descartados. */
function anexoLog(v: unknown): AnexoLog | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  if (typeof a.formato !== "string" || !/^[A-Z]{1,20}$/.test(a.formato)) return null;
  const r: AnexoLog = { formato: a.formato };
  const paginas = inteiro(a.paginas, 100_000);
  const bytes = inteiro(a.bytes, 1_000_000_000);
  if (paginas !== null) r.paginas = paginas;
  if (bytes !== null) r.bytes = bytes;
  return r;
}

/** Linha da conversa pronta para gravar: mascarada, sem caracteres de controle, cortada e com IDs conferidos. Determinística. */
export function montarLogMensagem(e: EntradaLog): LogMensagem {
  const ferramentas = Array.isArray(e.ferramentas) ? e.ferramentas.filter((f): f is string => typeof f === "string" && FERRAMENTA_RE.test(f)).slice(0, CONVERSAS_LIMITES.ferramentas) : [];
  const custo = typeof e.custoUsd === "number" && Number.isFinite(e.custoUsd) && e.custoUsd >= 0 ? Math.round(e.custoUsd * 1e6) / 1e6 : 0;
  return {
    pergunta: texto(e.pergunta, CONVERSAS_LIMITES.pergunta),
    resposta: texto(e.resposta, CONVERSAS_LIMITES.resposta),
    fim: typeof e.fim === "string" && FIM_RE.test(e.fim) ? e.fim : "desconhecido",
    ferramentas,
    passos: inteiro(e.passos, 1000) ?? 0,
    custoUsd: custo,
    anexo: anexoLog(e.anexo),
    pedidoId: idOuNull(e.pedidoId),
    documentoId: idOuNull(e.documentoId),
    planoId: idOuNull(e.planoId),
  };
}

/** Saída de groupBy por (orgId, userId) com _count, _max.createdAt e _sum.custoUsd. */
export type GrupoBruto = { orgId: string; userId: string; _count: { _all: number }; _max: { createdAt: Date | null }; _sum: { custoUsd: unknown } };
export type Conversa = { orgId: string; userId: string; total: number; ultima: Date; custoUsd: number };

/** Uma conversa por pessoa e instituição, da mais recente para a mais antiga. Grupos sem data ou vazios saem. */
export function agruparConversas(grupos: GrupoBruto[]): Conversa[] {
  return grupos
    .filter((g) => g._max.createdAt instanceof Date && g._count._all > 0)
    .map((g) => {
      const c = Number(g._sum.custoUsd == null ? 0 : String(g._sum.custoUsd));
      return { orgId: g.orgId, userId: g.userId, total: g._count._all, ultima: g._max.createdAt as Date, custoUsd: Number.isFinite(c) ? Math.round(c * 1e6) / 1e6 : 0 };
    })
    .sort((a, b) => b.ultima.getTime() - a.ultima.getTime() || a.orgId.localeCompare(b.orgId) || a.userId.localeCompare(b.userId));
}
