"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, auditRaw, requireSession, type Session } from "@/lib/auth";
import { PROPOSAL_BATCH_DEADLINE_MS, PROPOSAL_BATCH_LOCK_MS, batchAiTimeout, parseDebtsCsv, proposal, type AiStatus, type Option } from "@/lib/collection";
import { aiCallFor, markUsageRejected } from "@/lib/ai-meter";
import { getSettings } from "@/lib/settings";
import { appUrl, applyPayment, newAgreementToken } from "@/lib/payments";
import { decodeText, readUpload } from "@/lib/upload";
import { fail } from "@/lib/errors";
import { PROPOSAL_DEDUP_MS } from "@/lib/idempotencia";

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

type ProposalOutcome = { created: false; reason: "fechado" | "recente" } | { created: true; aiStatus: AiStatus };
type ProposalAi = { useAi?: boolean; timeoutMs?: number };

// Grava a proposta e audita a IA quando ela foi rejeitada, falhou ou foi barrada pelo teto (só contrato e motivo, nunca o texto)
async function createProposal(s: Session, debtId: string, ai: ProposalAi = {}): Promise<ProposalOutcome> {
  const orgId = s.orgId;
  const d = await db.debt.findFirstOrThrow({ where: { id: debtId, orgId } });
  if (d.status === "ACORDO" || d.status === "QUITADO") return { created: false, reason: "fechado" };
  // Trava curta e atômica antes da IA: um segundo clique (ou o lote) no mesmo contrato não gera outra proposta
  const now = new Date();
  const lock = await db.debt.updateMany({
    where: { id: debtId, orgId, OR: [{ proposalLockUntil: null }, { proposalLockUntil: { lt: now } }] },
    data: { proposalLockUntil: new Date(now.getTime() + PROPOSAL_DEDUP_MS) },
  });
  if (!lock.count) return { created: false, reason: "recente" };
  const cfg = await getSettings(orgId);
  const token = newAgreementToken();
  const useAi = ai.useAi !== false;
  const p = await proposal({ ...d, principal: Number(d.principal) }, `${appUrl()}/acordo/${token}`, cfg.collection, cfg.pix.merchant, {
    useAi,
    call: useAi ? aiCallFor(orgId) : undefined,
    timeoutMs: ai.timeoutMs,
  });
  const rec = p.options[p.recommended];
  await db.$transaction([
    // Uma proposta ativa por contrato: as anteriores em aberto são canceladas
    db.agreement.updateMany({ where: { debtId, status: "PROPOSTO", debt: { orgId } }, data: { status: "CANCELADO" } }),
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
        messageBase: p.messageBase,
        aiStatus: p.aiStatus,
        aiProvider: p.provider,
        expiresAt: new Date(Date.now() + cfg.collection.validityDays * 86_400_000),
      },
    }),
    db.debt.updateMany({ where: { id: debtId, orgId }, data: { status: "NEGOCIANDO" } }),
  ]);
  if (p.aiStatus === "rejeitada") {
    await markUsageRejected(orgId, p.usageId);
    await audit(s, "ia.rejeitada", `Cobrança, contrato ${d.contract}: ${p.missing.join("; ")}`.slice(0, 500));
  }
  if (p.aiStatus === "falhou") await audit(s, "ia.falhou", `Cobrança, contrato ${d.contract}: ${p.aiDetail ?? ""}`.slice(0, 500));
  return { created: true, aiStatus: p.aiStatus };
}

export async function generateProposal(debtId: string) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const d = await db.debt.findFirst({ where: { id: debtId, orgId: s.orgId } });
  if (!d) fail("/cobranca", "Contrato não encontrado.");
  const r = await createProposal(s, debtId);
  if (!r.created && r.reason === "recente") {
    // Clique repetido: a proposta já está sendo (ou acabou de ser) gerada; leva ao detalhe sem chamar a IA
    await audit(s, "cobranca.proposta.ignorada", `Contrato ${d.contract}: pedido repetido em menos de ${PROPOSAL_DEDUP_MS / 1000} s`);
    redirect(`/cobranca/${debtId}`);
  }
  if (!r.created) fail(`/cobranca/${debtId}`, "Este contrato já tem acordo fechado.");
  if (r.aiStatus === "bloqueada_limite") await audit(s, "ia.limite", `Cobrança, contrato ${d.contract}: teto diário de IA atingido`);
  await audit(s, "cobranca.proposta", `Contrato ${d.contract} (IA: ${r.aiStatus})`);
  revalidatePath("/cobranca");
  redirect(`/cobranca/${debtId}`);
}

// Após 3 falhas seguidas da IA, o resto do lote sai com a mensagem padrão (sem esperar timeouts em série)
const BREAKER_LIMIT = 3;

// Lote: um por vez na instituição (trava no banco), para em PROPOSAL_BATCH_DEADLINE_MS e devolve o restante.
// "Continuar gerando" chama esta mesma action: ela só pega contratos ainda EM_ABERTO.
export async function generateAllProposals() {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const started = Date.now();
  const lock = await db.organization.updateMany({
    where: { id: s.orgId, OR: [{ aiBatchLockUntil: null }, { aiBatchLockUntil: { lt: new Date(started) } }] },
    data: { aiBatchLockUntil: new Date(started + PROPOSAL_BATCH_LOCK_MS) },
  });
  if (!lock.count) fail("/cobranca", "Já há uma geração em andamento. Aguarde ela terminar e tente de novo.");

  const deadline = started + PROPOSAL_BATCH_DEADLINE_MS;
  const c = { geradas: 0, ia: 0, rejeitadas: 0, falhas: 0, erros: 0, bloqueadas: 0, restantes: 0 };
  let seguidas = 0;
  let teto = false;
  try {
    const open = await db.debt.findMany({ where: { orgId: s.orgId, status: "EM_ABERTO" }, select: { id: true }, orderBy: { dueDate: "asc" } });
    for (let i = 0; i < open.length; i++) {
      // Sem tempo para mais um contrato: para aqui e devolve o restante para "Continuar gerando"
      if (Date.now() >= deadline) {
        c.restantes = open.length - i;
        break;
      }
      try {
        const useAi = !teto && seguidas < BREAKER_LIMIT;
        const r = await createProposal(s, open[i].id, { useAi, timeoutMs: batchAiTimeout(deadline, Date.now()) });
        if (!r.created) continue;
        c.geradas++;
        if (r.aiStatus === "usada") c.ia++;
        if (r.aiStatus === "rejeitada") c.rejeitadas++;
        if (r.aiStatus === "falhou") c.falhas++;
        if (r.aiStatus === "bloqueada_limite") teto = true;
        // Teto estourado no meio do lote: o resto sai sem IA e conta como bloqueado
        if (teto && (r.aiStatus === "bloqueada_limite" || r.aiStatus === "desligada")) c.bloqueadas++;
        seguidas = r.aiStatus === "falhou" ? seguidas + 1 : r.aiStatus === "desligada" ? seguidas : 0;
      } catch {
        // Um contrato com problema não derruba o lote
        c.erros++;
      }
    }
  } finally {
    await db.organization.updateMany({ where: { id: s.orgId }, data: { aiBatchLockUntil: null } }).catch(() => undefined);
    if (teto) await audit(s, "ia.limite", `Cobrança em lote: teto diário de IA atingido; ${c.bloqueadas} proposta(s) sem IA`).catch(() => undefined);
    await audit(
      s,
      "cobranca.proposta_lote",
      `${c.geradas} propostas geradas · IA usada ${c.ia} · rejeitada ${c.rejeitadas} · falhou ${c.falhas} · bloqueada pelo teto ${c.bloqueadas} · erros ${c.erros} · restantes ${c.restantes}${seguidas >= BREAKER_LIMIT ? " · IA desligada no lote após falhas seguidas" : ""}`,
    );
  }
  revalidatePath("/cobranca");
  redirect(`/cobranca?propostas=${c.geradas}&restantes=${c.restantes}&falhas=${c.falhas + c.erros}&bloqueadas=${c.bloqueadas}`);
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

  const r = await applyPayment({ agreementId: a.id, orgId: s.orgId, amount, source: "MANUAL", createdBy: s.name });
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
    await db.debt.updateMany({ where: { id: a.debtId, orgId: a.debt.orgId }, data: { status: "ACORDO" } });
    await auditRaw(a.debt.orgId, null, "cobranca.aceite", `Contrato ${a.debt.contract}: ${opt.label} de R$ ${opt.total.toFixed(2)} (devedor)`);
  }
  redirect(`/acordo/${token}`);
}
