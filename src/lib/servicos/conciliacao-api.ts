// Formato público (v1) de uma conciliação na API. Nomes em português, valores em reais (number).
import type { Reconciliation, ReconciliationItem } from "@prisma/client";
import { lerLinhasInvalidas } from "@/lib/layout-conciliacao";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : null);

const cambioDe = (o: unknown) => {
  const c = o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>).cambio : undefined;
  return c && typeof c === "object" ? c : null;
};

// opcoes sem linhasInvalidas (que sai no campo próprio, sem duplicar)
const opcoesDe = (o: Reconciliation["options"]) => {
  if (!o || typeof o !== "object" || Array.isArray(o) || !("linhasInvalidas" in o)) return o;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { linhasInvalidas, ...resto } = o as Record<string, unknown>;
  return resto;
};

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
    opcoes: opcoesDe(r.options),
    // Campos novos: moeda base (a dos esperados) e o câmbio manual usado; "BRL" e null em conciliações antigas ou sem câmbio
    currency: r.currency,
    cambio: cambioDe(r.options),
    // Campos de saída novos (opcionais): hash SHA-256 dos arquivos enviados; nulo em conciliações antigas
    hashArquivoBanco: r.bankFileSha256 ?? null,
    hashArquivoEsperados: r.expectedFileSha256 ?? null,
    // Campo novo (opcional): linhas do extrato que não puderam ser lidas { total, itens[{ linha, campo, bruto, motivo }] }; null em conciliações antigas
    linhasInvalidas: lerLinhasInvalidas(r.options),
  };
}

export function itemJson(i: ReconciliationItem, todos: ReconciliationItem[] = []) {
  const vinculado = i.linkedItemId ? todos.find((t) => t.id === i.linkedItemId) : undefined;
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
    situacaoOriginal: i.originalStatus,
    resolucao: i.resolution,
    justificativa: i.resolutionNote,
    resolvidoPor: i.resolvedByName,
    resolvidoEm: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    itemVinculado: vinculado?.reference ?? null,
    // Taxa de cartão (pista; não muda a situação). Campos novos e opcionais: nulos/false em conciliações antigas
    formaPagamento: i.formaPagamento ?? null,
    taxaEsperada: n(i.taxaEsperada),
    explicadoPelaTaxa: i.explicadoTaxa,
    // Câmbio manual (pista; não muda a situação): valor do crédito na moeda do extrato; nulo/false sem câmbio
    valorOriginal: n(i.amountOriginal),
    explicadoPeloCambio: i.explicadoCambio,
    // Prova: linhas usadas dos dois arquivos (CPF/CNPJ mascarados) e a regra; nulo em conciliações antigas
    prova: i.evidence ?? null,
  };
}
