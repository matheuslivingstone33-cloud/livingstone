// Aplicação de pagamentos a acordos: usada pelo registro manual e pelo webhook Pix.
import { randomInt } from "node:crypto";
import { db } from "./db";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

// Token do link do devedor: 18 caracteres alfanuméricos (~104 bits), sem símbolos, para caber no txid do Pix
export function newAgreementToken() {
  return Array.from({ length: 18 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

// Endereço público da aplicação: nunca derivado do cabeçalho Host (que o cliente controla)
export function appUrl() {
  const u = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (!u) {
    if (process.env.NODE_ENV === "production") throw new Error("Defina APP_URL (ex.: https://finops.suaempresa.com.br).");
    return "http://localhost:3000";
  }
  return u.replace(/\/+$/, "");
}

export type ApplyResult = { status: "applied" | "duplicate" | "not_found" | "not_payable"; settled?: boolean; paid?: number };

export async function applyPayment(p: {
  agreementId: string;
  amount: number;
  paidAt?: Date;
  source: "MANUAL" | "PIX_WEBHOOK";
  endToEndId?: string;
  txid?: string;
  createdBy?: string;
}): Promise<ApplyResult> {
  return db.$transaction(async (tx) => {
    // Trava a linha do acordo: pagamentos simultâneos são somados em fila, nunca em paralelo
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Agreement" WHERE id = ${p.agreementId} FOR UPDATE`;
    if (!rows.length) return { status: "not_found" };
    const a = await tx.agreement.findUniqueOrThrow({ where: { id: p.agreementId } });
    if (a.status !== "ACEITO") return { status: "not_payable" };
    if (p.endToEndId && (await tx.payment.findUnique({ where: { endToEndId: p.endToEndId } }))) return { status: "duplicate" };

    await tx.payment.create({
      data: {
        agreementId: a.id,
        amount: p.amount,
        paidAt: p.paidAt ?? new Date(),
        source: p.source,
        endToEndId: p.endToEndId,
        txid: p.txid,
        createdBy: p.createdBy,
      },
    });
    const paid = Math.round((Number(a.paidAmount ?? 0) + p.amount) * 100) / 100;
    const settled = paid >= Number(a.total) - 0.01;
    await tx.agreement.update({ where: { id: a.id }, data: { status: settled ? "PAGO" : "ACEITO", paidAt: p.paidAt ?? new Date(), paidAmount: paid } });
    await tx.debt.update({ where: { id: a.debtId }, data: { status: settled ? "QUITADO" : "ACORDO" } });
    return { status: "applied", settled, paid };
  });
}
