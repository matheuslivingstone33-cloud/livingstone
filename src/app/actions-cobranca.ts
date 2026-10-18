"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, auditRaw, requireSession } from "@/lib/auth";
import { parseDebtsCsv, proposal, type Option } from "@/lib/collection";
import { getSettings } from "@/lib/settings";
import { appUrl, applyPayment, newAgreementToken } from "@/lib/payments";
import { decodeText, readUpload } from "@/lib/upload";
import { fail } from "@/lib/errors";

export async function importDebts(form: FormData) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const f = await readUpload(form.get("file"), ["text"]).catch((e: Error) => fail("/cobranca", e.message));
  if (!f) fail("/cobranca", "Envie o arquivo da carteira (CSV).");
  const rows = parseDebtsCsv(decodeText(f.data));
  if (!rows.length) fail("/cobranca", "Nenhum contrato válido no arquivo. Confira as colunas: contrato; devedor; cpf_cnpj; valor; vencimento.");

  await db.$transaction(
    rows.map((r) =>
      db.debt.upsert({
        where: { orgId_contract: { orgId: s.orgId, contract: r.contract } },
        // Reimportar não reabre contratos em negociação, com acordo ou quitados
        update: { debtor: r.debtor, document: r.document, phone: r.phone, email: r.email, product: r.product, importedFrom: f.name },
        create: { ...r, orgId: s.orgId, importedFrom: f.name },
      }),
    ),
  );
  await audit(s, "cobranca.importar", `${f.name}: ${rows.length} contratos`);
  revalidatePath("/cobranca");
  redirect(`/cobranca?importados=${rows.length}`);
}

async function createProposal(orgId: string, debtId: string) {
  const d = await db.debt.findFirstOrThrow({ where: { id: debtId, orgId } });
  if (d.status === "ACORDO" || d.status === "QUITADO") return false;
  const cfg = await getSettings(orgId);
  const token = newAgreementToken();
  const p = await proposal({ ...d, principal: Number(d.principal) }, `${appUrl()}/acordo/${token}`, cfg.collection, cfg.pix.merchant);
  const rec = p.options[p.recommended];
  await db.$transaction([
    // Uma proposta ativa por contrato: as anteriores em aberto são canceladas
    db.agreement.updateMany({ where: { debtId, status: "PROPOSTO" }, data: { status: "CANCELADO" } }),
    db.agreement.create({
      data: {
        debtId,
        token,
        daysLate: p.days,
        updatedDebt: p.total,
        discountPct: rec.discountPct,
        total: rec.total,
        installments: rec.installments,
        installment: rec.installment,
        options: p.options,
        message: p.message,
        aiProvider: p.provider,
        expiresAt: new Date(Date.now() + cfg.collection.validityDays * 86_400_000),
      },
    }),
    db.debt.update({ where: { id: debtId }, data: { status: "NEGOCIANDO" } }),
  ]);
  return true;
}

export async function generateProposal(debtId: string) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const d = await db.debt.findFirst({ where: { id: debtId, orgId: s.orgId } });
  if (!d) fail("/cobranca", "Contrato não encontrado.");
  if (!(await createProposal(s.orgId, debtId))) fail(`/cobranca/${debtId}`, "Este contrato já tem acordo fechado.");
  await audit(s, "cobranca.proposta", `Contrato ${d.contract}`);
  revalidatePath("/cobranca");
  redirect(`/cobranca/${debtId}`);
}

export async function generateAllProposals() {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const open = await db.debt.findMany({ where: { orgId: s.orgId, status: "EM_ABERTO" }, select: { id: true } });
  let n = 0;
  for (const d of open) if (await createProposal(s.orgId, d.id)) n++;
  await audit(s, "cobranca.proposta_lote", `${n} propostas geradas`);
  revalidatePath("/cobranca");
  redirect(`/cobranca?propostas=${n}`);
}

export async function registerPayment(agreementId: string, form: FormData) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const a = await db.agreement.findFirst({ where: { id: agreementId, debt: { orgId: s.orgId } }, include: { debt: true } });
  if (!a) fail("/cobranca", "Acordo não encontrado.");
  const amount = Number(String(form.get("amount") ?? "").replace(/\./g, "").replace(",", "."));
  const back = `/cobranca/${a.debtId}`;
  if (!(amount > 0) || amount > 100_000_000) fail(back, "Informe um valor pago válido.");
  const remaining = Number(a.total) - Number(a.paidAmount ?? 0);
  if (amount > remaining + 0.01) fail(back, `O valor excede o saldo do acordo (${remaining.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`);

  const r = await applyPayment({ agreementId: a.id, amount, source: "MANUAL", createdBy: s.name });
  // Rechecado dentro da transação: um Pix pode ter chegado entre a conferência acima e a gravação
  if (r.status === "exceeds_balance")
    fail(back, `O valor excede o saldo do acordo (${(r.remaining ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`);
  if (r.status !== "applied") fail(back, "Este acordo não está aguardando pagamento.");
  await audit(s, "cobranca.pagamento", `Contrato ${a.debt.contract}: R$ ${amount.toFixed(2)} (manual)`);
  revalidatePath(back);
}

// Página pública: o devedor escolhe a condição e aceita o acordo
export async function acceptAgreement(token: string, form: FormData) {
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(token)) redirect("/acordo/invalido");
  const a = await db.agreement.findUnique({ where: { token }, include: { debt: true } });
  if (!a || a.status !== "PROPOSTO" || a.expiresAt < new Date()) redirect(`/acordo/${token}`);
  const options = a.options as unknown as Option[];
  const idx = Number(form.get("option"));
  const opt = Number.isInteger(idx) ? options[idx] : undefined;
  if (!opt) redirect(`/acordo/${token}`);
  // Atualização condicional: só um aceite vence, mesmo com cliques simultâneos
  const { count } = await db.agreement.updateMany({
    where: { id: a.id, status: "PROPOSTO" },
    data: { status: "ACEITO", acceptedAt: new Date(), total: opt.total, installments: opt.installments, installment: opt.installment, discountPct: opt.discountPct },
  });
  if (count === 1) {
    await db.debt.update({ where: { id: a.debtId }, data: { status: "ACORDO" } });
    await auditRaw(a.debt.orgId, null, "cobranca.aceite", `Contrato ${a.debt.contract}: ${opt.label} de R$ ${opt.total.toFixed(2)} (devedor)`);
  }
  redirect(`/acordo/${token}`);
}
