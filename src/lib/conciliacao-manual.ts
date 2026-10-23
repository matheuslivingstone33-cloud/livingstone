// Fechamentos humanos da conciliação: vínculo manual, aceite de divergência, baixa e reabertura.
// Lógica pura: recebe os itens como estão e devolve o que deve mudar. Sem banco, sem Next, sem IA.

export type StatusItem = "CONCILIADO" | "DIVERGENTE" | "PENDENTE" | "NAO_ESPERADO" | "VINCULADO" | "BAIXADO";
export type Resolucao = "MANUAL_VINCULO" | "ACEITE_DIVERGENCIA" | "BAIXA";

export const JUSTIFICATIVA_MIN_CONCILIACAO = 20;
export const JUSTIFICATIVA_MAX = 2000;

/** Item como a lib o enxerga (valores em reais, number). */
export type ItemManual = {
  id: string;
  reference: string;
  status: string;
  payer?: string | null;
  expectedAmount?: number | null;
  receivedAmount?: number | null;
  paidAt?: Date | null;
  excess?: number | null;
  rule?: string | null;
  originalStatus?: string | null;
  resolution?: string | null;
  linkedItemId?: string | null;
};

/** Campos a gravar em um item (o serviço acrescenta autor, data e versão). */
export type Alteracao = {
  id: string;
  fromStatus: string;
  data: {
    status: string;
    originalStatus: string | null;
    resolution: Resolucao | null;
    linkedItemId?: string | null;
    receivedAmount?: number | null;
    paidAt?: Date | null;
    excess?: number | null;
    rule?: string | null;
  };
};

export class ConciliacaoManualError extends Error {}
const erro = (m: string): never => {
  throw new ConciliacaoManualError(m);
};

const cents = (n: number | null | undefined) => Math.round((n ?? 0) * 100);

export function validarJustificativa(txt: unknown, min = JUSTIFICATIVA_MIN_CONCILIACAO): string {
  const t = String(txt ?? "").trim();
  if (t.length < min) erro(`A justificativa precisa ter ao menos ${min} caracteres (fica registrada para auditoria).`);
  return t.slice(0, JUSTIFICATIVA_MAX);
}

function exigeAberto(i: ItemManual) {
  if (i.resolution) erro(`O item ${i.reference} já foi resolvido manualmente. Reabra-o antes de mudar.`);
}

/** Vincula um título não pago (PENDENTE) a um crédito sem título (NAO_ESPERADO). */
export function planejarVinculo(pendente: ItemManual, naoEsperado: ItemManual): Alteracao[] {
  if (pendente.id === naoEsperado.id) erro("Escolha dois itens diferentes.");
  exigeAberto(pendente);
  exigeAberto(naoEsperado);
  if (pendente.status !== "PENDENTE") erro("O vínculo parte de um título não pago (PENDENTE).");
  if (naoEsperado.status !== "NAO_ESPERADO") erro("O vínculo precisa de um crédito não esperado (NAO_ESPERADO).");
  const esperado = cents(pendente.expectedAmount);
  const recebido = cents(naoEsperado.receivedAmount);
  const diff = recebido - esperado;
  return [
    {
      id: pendente.id,
      fromStatus: pendente.status,
      data: {
        status: diff >= 0 ? "CONCILIADO" : "DIVERGENTE",
        originalStatus: pendente.status,
        resolution: "MANUAL_VINCULO",
        linkedItemId: naoEsperado.id,
        receivedAmount: recebido / 100,
        paidAt: naoEsperado.paidAt ?? null,
        excess: diff > 0 ? diff / 100 : null,
        rule: "MANUAL",
      },
    },
    {
      id: naoEsperado.id,
      fromStatus: naoEsperado.status,
      data: { status: "VINCULADO", originalStatus: naoEsperado.status, resolution: "MANUAL_VINCULO", linkedItemId: pendente.id },
    },
  ];
}

/** Aceita uma divergência: o item passa a conciliado, mantendo os valores. */
export function planejarAceite(item: ItemManual): Alteracao {
  exigeAberto(item);
  if (item.status !== "DIVERGENTE") erro("Só é possível aceitar a divergência de um item DIVERGENTE.");
  return { id: item.id, fromStatus: item.status, data: { status: "CONCILIADO", originalStatus: item.status, resolution: "ACEITE_DIVERGENCIA" } };
}

/** Baixa um item que não será conciliado (ex.: título cancelado, crédito estornado). */
export function planejarBaixa(item: ItemManual): Alteracao {
  exigeAberto(item);
  if (!["PENDENTE", "NAO_ESPERADO", "DIVERGENTE"].includes(item.status)) erro("Só itens não pagos, não esperados ou divergentes podem ser baixados.");
  return { id: item.id, fromStatus: item.status, data: { status: "BAIXADO", originalStatus: item.status, resolution: "BAIXA" } };
}

/** Reabre um item resolvido, voltando ao status original. No vínculo, os dois itens voltam. */
export function planejarReabertura(item: ItemManual, vinculado?: ItemManual | null): Alteracao[] {
  if (!item.resolution || !item.originalStatus) erro("Este item não tem resolução manual para reabrir.");
  const volta = (i: ItemManual): Alteracao => {
    const base: Alteracao["data"] = { status: i.originalStatus!, originalStatus: null, resolution: null, linkedItemId: null };
    // O título vinculado volta a não pago: sem valor recebido, data, excedente nem regra
    if (i.resolution === "MANUAL_VINCULO" && i.originalStatus === "PENDENTE")
      Object.assign(base, { receivedAmount: null, paidAt: null, excess: null, rule: null });
    return { id: i.id, fromStatus: i.status, data: base };
  };
  if (item.resolution !== "MANUAL_VINCULO") return [volta(item)];
  if (!vinculado || vinculado.id !== item.linkedItemId || vinculado.linkedItemId !== item.id || vinculado.resolution !== "MANUAL_VINCULO")
    erro("Item vinculado não encontrado: não é possível reabrir o vínculo.");
  return [volta(item), volta(vinculado!)];
}

/** Contadores da conciliação. VINCULADO e BAIXADO não contam como pendência. */
export function resumir(items: { status: string; excess?: number | null }[]) {
  const n = (st: string) => items.filter((i) => i.status === st).length;
  return {
    matched: n("CONCILIADO"),
    divergent: n("DIVERGENTE"),
    missing: n("PENDENTE"),
    unexpected: n("NAO_ESPERADO"),
    excess: items.filter((i) => i.status !== "BAIXADO").reduce((a, i) => a + cents(i.excess), 0) / 100,
  };
}

/** Aplica alterações sobre uma lista (útil para recalcular antes de gravar e nos testes). */
export function aplicar<T extends ItemManual>(items: T[], alts: Alteracao[]): T[] {
  const byId = new Map(alts.map((a) => [a.id, a.data]));
  return items.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id) } : i));
}
