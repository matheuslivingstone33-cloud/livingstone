"use server";

import { db } from "@/lib/db";
import { audit, requireSession } from "@/lib/auth";
import { compareReceipt, deriveReceiptSecret, verifyReceipt, type ReceiptResult } from "@/lib/audit-chain";

export type ConferirState = { resultado?: ReceiptResult; seq?: number; lastSeq?: number; emitidoEm?: string; error?: string };

const MAX_BYTES = 4096;

// Confere um recibo de integridade contra o banco atual da organização da sessão
export async function conferirRecibo(_prev: ConferirState, form: FormData): Promise<ConferirState> {
  const s = await requireSession(["ADMIN", "AUDITOR"]);
  const file = form.get("arquivo");
  let text: string;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { error: "Arquivo grande demais para um recibo (máximo 4 KB)." };
    text = await file.text();
  } else {
    text = String(form.get("json") ?? "");
  }
  if (!text.trim()) return { error: "Envie o arquivo do recibo ou cole o conteúdo JSON." };
  if (Buffer.byteLength(text) > MAX_BYTES) return { error: "Conteúdo grande demais para um recibo (máximo 4 KB)." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "O conteúdo não é um JSON válido." };
  }
  if (!raw || typeof raw !== "object" || (raw as { v?: unknown }).v !== 1) return { error: "Formato de recibo desconhecido." };
  if ((raw as { orgId?: unknown }).orgId !== s.orgId) return { error: "Este recibo não é desta organização." };
  let secret: Buffer;
  try {
    secret = deriveReceiptSecret(process.env);
  } catch {
    return { error: "Conferência indisponível: segredo do ambiente não configurado." };
  }
  const receipt = verifyReceipt(secret, raw);
  if (!receipt) {
    await audit(s, "auditoria.recibo_conferido", "assinatura inválida");
    return { error: "Assinatura inválida: o recibo foi alterado ou não foi emitido neste ambiente." };
  }
  const [atSeq, last] = await Promise.all([
    db.auditLog.findFirst({ where: { orgId: s.orgId, seq: receipt.seq }, select: { hash: true } }),
    db.auditLog.findFirst({ where: { orgId: s.orgId, seq: { not: null } }, orderBy: { seq: "desc" }, select: { seq: true } }),
  ]);
  const lastSeq = last?.seq ?? 0;
  const resultado = compareReceipt(receipt, { lastSeq, hashAtSeq: atSeq?.hash ?? null });
  await audit(s, "auditoria.recibo_conferido", `${resultado} (recibo seq ${receipt.seq}, emitido em ${receipt.emitidoEm}; último seq ${lastSeq})`);
  return { resultado, seq: receipt.seq, lastSeq, emitidoEm: receipt.emitidoEm };
}
