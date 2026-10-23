"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, auditRaw, clientIp, requireSession, type Session } from "@/lib/auth";
import { PROPOSAL_BATCH_DEADLINE_MS, PROPOSAL_BATCH_LOCK_MS, batchAiTimeout, parseDebtsCsv, type Option } from "@/lib/collection";
import { applyPayment } from "@/lib/payments";
import { createProposal, type Ator } from "@/lib/cobranca-proposta";
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

// Ator da sessão para a geração da proposta (mesma auditoria de antes, com o IP da requisição)
async function atorDe(s: Session): Promise<Ator> {
  return { orgId: s.orgId, userId: s.userId, nome: s.name, ip: await clientIp() };
}

export async function generateProposal(debtId: string) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const d = await db.debt.findFirst({ where: { id: debtId, orgId: s.orgId } });
  if (!d) fail("/cobranca", "Contrato não encontrado.");
  const r = await createProposal(await atorDe(s), debtId);
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
  const ator = await atorDe(s);
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
        const r = await createProposal(ator, open[i].id, { useAi, timeoutMs: batchAiTimeout(deadline, Date.now()) });
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
