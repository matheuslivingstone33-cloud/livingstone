// Idempotência de ações caras (ex.: proposta com IA). Puro: sem banco, sem Next.

/** Janela em que um segundo pedido de proposta para o mesmo contrato é ignorado. */
export const PROPOSAL_DEDUP_MS = 10_000;

/** Houve pedido há menos de `windowMs`? Um instante no futuro (relógio adiantado) conta como recente. */
export function isRecentProposal(last: Date | null, now: Date, windowMs: number = PROPOSAL_DEDUP_MS): boolean {
  if (!last) return false;
  return now.getTime() - last.getTime() < windowMs;
}
