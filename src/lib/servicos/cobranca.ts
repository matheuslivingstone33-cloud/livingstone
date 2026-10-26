// Geração da proposta de um contrato pedida por uma pessoa (clique na tela ou plano confirmado do assistente).
// Mesmo comportamento e mesma auditoria da action original; quem chama decide o redirecionamento.
import { db } from "@/lib/db";
import { auditRaw } from "@/lib/auth";
import { createProposal, type Ator } from "@/lib/cobranca-proposta";
import { PROPOSAL_DEDUP_MS } from "@/lib/idempotencia";
import type { AiStatus } from "@/lib/collection";

export type GerarPropostaResultado =
  | { status: "nao_encontrado" }
  | { status: "recente"; contract: string }
  | { status: "fechado"; contract: string }
  | { status: "criada"; contract: string; aiStatus: AiStatus };

export async function gerarPropostaServico(ator: Ator, debtId: string): Promise<GerarPropostaResultado> {
  const d = await db.debt.findFirst({ where: { id: debtId, orgId: ator.orgId }, select: { contract: true } });
  if (!d) return { status: "nao_encontrado" };
  const r = await createProposal(ator, debtId);
  if (!r.created && r.reason === "recente") {
    // Clique repetido: a proposta já está sendo (ou acabou de ser) gerada; não chama a IA
    await auditRaw(ator.orgId, ator.userId, "cobranca.proposta.ignorada", `Contrato ${d.contract}: pedido repetido em menos de ${PROPOSAL_DEDUP_MS / 1000} s`, ator.ip);
    return { status: "recente", contract: d.contract };
  }
  if (!r.created) return { status: "fechado", contract: d.contract };
  if (r.aiStatus === "bloqueada_limite") await auditRaw(ator.orgId, ator.userId, "ia.limite", `Cobrança, contrato ${d.contract}: teto diário de IA atingido`, ator.ip);
  await auditRaw(ator.orgId, ator.userId, "cobranca.proposta", `Contrato ${d.contract} (IA: ${r.aiStatus})`, ator.ip);
  return { status: "criada", contract: d.contract, aiStatus: r.aiStatus };
}
