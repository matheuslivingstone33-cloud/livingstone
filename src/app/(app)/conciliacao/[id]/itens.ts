// Conversões dos itens gravados para as frases da prova (Decimal → number).
import type { ReconciliationItem } from "@prisma/client";
import { normRef } from "@/lib/reconcile";
import type { ItemFrase } from "@/lib/prova-conciliacao";

export type SemProva = Omit<ReconciliationItem, "evidence">;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
export const paraFrase = (i: SemProva): ItemFrase => ({ ...i, expectedAmount: n(i.expectedAmount), receivedAmount: n(i.receivedAmount) });
/** Títulos que já tiveram pagamento: um crédito sem par com a mesma referência é possível duplicidade. */
export const referenciasPagas = (items: SemProva[]) => new Set(items.filter((i) => i.expectedAmount !== null && i.receivedAmount !== null).map((i) => normRef(i.reference)));
