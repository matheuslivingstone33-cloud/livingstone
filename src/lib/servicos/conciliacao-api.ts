// Formato público (v1) de uma conciliação na API. Nomes em português, valores em reais (number).
import type { Reconciliation, ReconciliationItem } from "@prisma/client";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : null);

export function reconciliationJson(r: Reconciliation) {
  return {
    id: r.id,
    nome: r.name,
    criadaEm: r.createdAt.toISOString(),
    formatoBanco: r.bankFormat,
    resumo: {
      conciliados: r.matched,
      divergentes: r.divergent,
      pendentes: r.missing,
      naoEsperados: r.unexpected,
      totalEsperado: n(r.totalExpected),
      totalRecebido: n(r.totalReceived),
      excedente: n(r.totalExcess),
    },
    opcoes: r.options,
  };
}

export function itemJson(i: ReconciliationItem) {
  return {
    referencia: i.reference,
    pagador: i.payer,
    valorEsperado: n(i.expectedAmount),
    valorRecebido: n(i.receivedAmount),
    vencimento: d(i.dueAt),
    pagoEm: d(i.paidAt),
    situacao: i.status,
    regra: i.rule,
    excedente: n(i.excess),
    observacao: i.note,
  };
}
