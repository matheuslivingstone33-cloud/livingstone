// Integridade da trilha de auditoria: hash encadeado, conferência em lotes e recibo assinado.
// Puro (só node:crypto): sem banco nem Next. Datas sempre por parâmetro.
import { createHash, createHmac, hkdfSync } from "node:crypto";
import { safeEqualHex } from "./api-keys";

export type AuditRow = {
  id: string;
  seq: number | null;
  prevHash: string | null;
  hash: string | null;
  orgId: string;
  userId: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
  createdAt: Date;
};

type HashInput = { prevHash: string; orgId: string; userId: string | null; action: string; detail: string | null; ip: string | null; createdAt: Date };

/** v1: registros gravados antes do número de sequência. Não mudar: invalidaria a corrente existente. */
export function auditHash(r: HashInput) {
  return createHash("sha256")
    .update([r.prevHash, r.orgId, r.userId ?? "", r.action, r.detail ?? "", r.ip ?? "", r.createdAt.toISOString()].join("␟"))
    .digest("hex");
}

/** v2: inclui o número de sequência, então apagar ou reordenar um registro deixa lacuna detectável. */
export function auditHashV2(r: HashInput & { seq: number }) {
  return createHash("sha256")
    .update(["v2", String(r.seq), r.prevHash, r.orgId, r.userId ?? "", r.action, r.detail ?? "", r.ip ?? "", r.createdAt.toISOString()].join("␟"))
    .digest("hex");
}

export type ChainState = {
  prev: string;
  nextSeq: number;
  legacy: number;
  checked: number;
  firstV2Seen: boolean;
  /** Data do primeiro registro v2 (se conhecida): registro sem hash depois dela não é legado. */
  v2Desde?: Date | null;
};
export type ChainProblem = { tipo: "sem_hash" | "quebra" | "lacuna" | "duplicado"; id: string; seq: number | null };

export const initialChainState = (v2Desde?: Date | null): ChainState => ({ prev: "GENESIS", nextSeq: 1, legacy: 0, checked: 0, firstV2Seen: false, v2Desde: v2Desde ?? null });

/**
 * Confere um lote na ordem (seq asc com nulos primeiro, createdAt asc, id asc).
 * Para no primeiro problema. O estado devolvido continua a conferência no lote seguinte.
 */
export function verifyBatch(state: ChainState, rows: AuditRow[]): { state: ChainState; problema?: ChainProblem } {
  const st = { ...state };
  for (const r of rows) {
    const bad = (tipo: ChainProblem["tipo"]) => ({ state: st, problema: { tipo, id: r.id, seq: r.seq } });
    const depoisDaV2 = st.firstV2Seen || (st.v2Desde != null && r.createdAt.getTime() >= st.v2Desde.getTime());
    if (!r.hash) {
      if (r.seq != null || depoisDaV2) return bad("sem_hash");
      st.legacy++; // legado não encadeado: contado, não recalculado
      continue;
    }
    if (r.seq == null) {
      // v1: só existe antes da primeira v2
      if (st.firstV2Seen || r.prevHash !== st.prev || r.hash !== auditHash({ ...r, prevHash: st.prev })) return bad("quebra");
      st.prev = r.hash;
      st.checked++;
      continue;
    }
    if (r.seq < st.nextSeq) return bad("duplicado");
    if (r.seq > st.nextSeq) return bad("lacuna");
    if (r.prevHash !== st.prev || r.hash !== auditHashV2({ ...r, prevHash: st.prev, seq: r.seq })) return bad("quebra");
    st.firstV2Seen = true;
    st.prev = r.hash;
    st.nextSeq++;
    st.checked++;
  }
  return { state: st };
}

// ---------- Recibo de integridade ----------

export type ReceiptPayload = { orgId: string; seq: number; hash: string; emitidoEm: string };
export type Receipt = ReceiptPayload & { v: 1; assinatura: string };

const canonical = (p: ReceiptPayload) => JSON.stringify({ v: 1, orgId: p.orgId, seq: p.seq, hash: p.hash, emitidoEm: p.emitidoEm });

export function signReceipt(secret: Buffer | string, p: ReceiptPayload): Receipt {
  const assinatura = createHmac("sha256", secret).update(canonical(p)).digest("hex");
  return { v: 1, orgId: p.orgId, seq: p.seq, hash: p.hash, emitidoEm: p.emitidoEm, assinatura };
}

/** Valida forma e assinatura. Devolve o recibo tipado ou null. */
export function verifyReceipt(secret: Buffer | string, raw: unknown): Receipt | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.orgId !== "string" || typeof r.hash !== "string" || typeof r.emitidoEm !== "string" || typeof r.assinatura !== "string") return null;
  if (typeof r.seq !== "number" || !Number.isInteger(r.seq) || r.seq < 1) return null;
  const p = { orgId: r.orgId, seq: r.seq, hash: r.hash, emitidoEm: r.emitidoEm };
  const expected = createHmac("sha256", secret).update(canonical(p)).digest("hex");
  return safeEqualHex(expected, r.assinatura) ? { v: 1, ...p, assinatura: r.assinatura } : null;
}

export type ReceiptResult = "integro" | "truncado" | "divergente";

/** Compara um recibo válido com o banco: lastSeq = maior seq atual; hashAtSeq = hash gravado no seq do recibo. */
export function compareReceipt(receipt: Pick<Receipt, "seq" | "hash">, db: { lastSeq: number; hashAtSeq: string | null }): ReceiptResult {
  if (receipt.seq > db.lastSeq) return "truncado";
  if (db.hashAtSeq == null || db.hashAtSeq !== receipt.hash) return "divergente";
  return "integro";
}

export const RECEIPT_HKDF_LABEL = "livingstone-audit-receipt-v1";

/** Segredo do recibo: AUDIT_RECEIPT_SECRET (≥32) ou derivado do AUTH_SECRET (≥32) via HKDF. Sem nenhum: falha fechada. */
export function deriveReceiptSecret(env: Record<string, string | undefined>): Buffer {
  const own = env.AUDIT_RECEIPT_SECRET;
  if (own && own.length >= 32) return Buffer.from(own, "utf8");
  const auth = env.AUTH_SECRET;
  if (auth && auth.length >= 32) return Buffer.from(hkdfSync("sha256", auth, Buffer.alloc(0), RECEIPT_HKDF_LABEL, 32));
  throw new Error("Sem segredo para o recibo de auditoria: defina AUDIT_RECEIPT_SECRET ou AUTH_SECRET (mínimo 32 caracteres).");
}

// ---------- Filtros da tela / exportação ----------

export const AUDIT_PAGE_SIZE = 100;
export const AUDIT_MAX_PAGE = 1000;

type Params = URLSearchParams | Record<string, string | string[] | undefined>;
const get = (p: Params, k: string) => {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
};

// America/Sao_Paulo não tem horário de verão desde 2019: offset fixo -03:00
const dayStart = (iso: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  // rejeita datas que o JS "corrige" (ex.: 2026-02-31)
  const back = new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  return back === iso ? d : null;
};

export type AuditFilters = {
  action: string;
  userId: string;
  de: string;
  ate: string;
  pagina: number;
  /** Limites efetivos: createdAt >= desde e < antesDe (até inclusivo). */
  desde: Date | null;
  antesDe: Date | null;
};

export function parseAuditFilters(p: Params): AuditFilters {
  const action = get(p, "acao").slice(0, 80);
  const userId = get(p, "usuario").slice(0, 64);
  const desde = dayStart(get(p, "de"));
  const ateIni = dayStart(get(p, "ate"));
  const antesDe = ateIni ? new Date(ateIni.getTime() + 24 * 3600_000) : null;
  const n = Number.parseInt(get(p, "pagina"), 10);
  const pagina = Number.isFinite(n) ? Math.min(Math.max(n, 1), AUDIT_MAX_PAGE) : 1;
  return { action, userId, de: desde ? get(p, "de") : "", ate: ateIni ? get(p, "ate") : "", pagina, desde, antesDe };
}

/** Where do Prisma (objeto simples), sempre com o orgId da sessão. */
export function auditWhere(orgId: string, f: AuditFilters) {
  return {
    orgId,
    ...(f.action ? { action: f.action } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.desde || f.antesDe ? { createdAt: { ...(f.desde ? { gte: f.desde } : {}), ...(f.antesDe ? { lt: f.antesDe } : {}) } } : {}),
  };
}

/** Query string dos filtros (sem a página), para links de exportação e paginação. */
export function filtersQuery(f: AuditFilters, extra: Record<string, string | number> = {}) {
  const q = new URLSearchParams();
  if (f.action) q.set("acao", f.action);
  if (f.userId) q.set("usuario", f.userId);
  if (f.de) q.set("de", f.de);
  if (f.ate) q.set("ate", f.ate);
  for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  return q.toString();
}

export const filtersSummary = (f: AuditFilters) =>
  [f.action && `ação=${f.action}`, f.userId && `usuário=${f.userId}`, f.de && `de=${f.de}`, f.ate && `até=${f.ate}`].filter(Boolean).join(", ") || "sem filtros";
