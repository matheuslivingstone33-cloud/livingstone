// Persistência da conciliação, compartilhada pela tela (server action) e pela API.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reconcileWith, summarize, type BankEntry, type Cnab400Layout, type ExpectedEntry, type ReconcileOptions } from "@/lib/reconcile";
import { limitarTotal, montarProva, type FonteProva } from "@/lib/prova-conciliacao";
import { classificarTaxa, type TaxaRecebimento } from "@/lib/taxa-recebimento";
import { CambioError, SEM_COTACAO, converterEntradas, explicadoCambio, type CambioInfo, type Cotacao } from "@/lib/cambio";
import type { Moeda } from "@/lib/moeda";

export type PersistInput = {
  name: string;
  bankFileName: string;
  bankFormat: string;
  expectedFileName: string;
  expected: ExpectedEntry[];
  entries: BankEntry[];
  options: ReconcileOptions;
  /** Metadados dos dois arquivos para a prova (hash, cabeçalho). Sem eles, os itens ficam sem prova. */
  fontes?: { esperados: FonteProva; banco: FonteProva };
  cnab400?: Cnab400Layout;
  /** Taxas por forma de recebimento da instituição (getSettings). Congeladas em options.taxas. */
  taxas?: TaxaRecebimento[];
  /** Moeda de cada arquivo (padrão BRL). A base da conciliação é a moeda dos esperados. */
  moedas?: { esperados: Moeda; extrato: Moeda };
  /** Obrigatório quando as moedas diferem: cotação (R$ por US$ 1), tolerância em % e quem informou. */
  cambio?: { cotacao: Cotacao; toleranciaPct: number; informadaPor: string };
};

const LOTE = 1000;
const cents = (n: number) => Math.round(n * 100);

export async function persistReconciliation(orgId: string, input: PersistInput) {
  const { expected, options, fontes } = input;
  const taxas = input.taxas ?? [];
  const base = input.moedas?.esperados ?? "BRL";
  const moedaExtrato = input.moedas?.extrato ?? "BRL";
  const cambio = base !== moedaExtrato ? input.cambio : undefined;
  if (base !== moedaExtrato && !cambio) throw new CambioError(SEM_COTACAO);
  // O extrato é convertido para a moeda dos esperados antes de conciliar; o valor original fica no item e na prova
  const conv = cambio ? converterEntradas(input.entries, moedaExtrato, base, cambio.cotacao) : undefined;
  const entries = conv?.entries ?? input.entries;
  const originais = conv?.originaisCentavos ?? [];
  const cambioInfo: CambioInfo | undefined = cambio && {
    moedaEsperados: base,
    moedaExtrato,
    base,
    cotacao: cambio.cotacao.texto,
    toleranciaPct: cambio.toleranciaPct,
    informadaPor: cambio.informadaPor.slice(0, 120),
    informadaEm: new Date().toISOString(),
  };
  const items = reconcileWith(expected, entries, { ...options, moeda: base });
  const { excess, ...counts } = summarize(items);
  // A taxa só acrescenta a pista: status e contagens vêm da conciliação acima, sem mudança.
  // As regras de taxa são em reais (parte fixa em centavos de R$): só valem para conciliação em BRL
  const taxa = items.map((i) => (base === "BRL" ? classificarTaxa(i, i.expectedIndex !== undefined ? expected[i.expectedIndex]?.forma : undefined, taxas) : { explicadoTaxa: false, formaPagamento: undefined, taxaEsperada: undefined }));
  const explicadosTaxa = taxa.filter((t) => t.explicadoTaxa).length;
  // Câmbio também é só pista: não muda status nem contagens
  const porCambio = items.map((i) => !!cambioInfo && i.receivedIndex !== undefined && explicadoCambio(i, cambioInfo.toleranciaPct));
  const explicadosCambio = porCambio.filter(Boolean).length;
  const regraCambio = (k: number) => {
    const j = items[k].receivedIndex;
    if (!cambioInfo || j === undefined) return undefined;
    return {
      moedaOriginal: moedaExtrato,
      valorOriginalCentavos: originais[j],
      valorConvertidoCentavos: cents(entries[j].amount),
      cotacao: cambioInfo.cotacao,
      toleranciaPct: cambioInfo.toleranciaPct,
      informadaPor: cambioInfo.informadaPor,
      explicadoCambio: porCambio[k],
    };
  };
  const provas = fontes
    ? limitarTotal(
        items.map((i, k) =>
          montarProva(i, { ...fontes.esperados, entries: expected }, { ...fontes.banco, entries }, { ...options, cnab400: input.cnab400 }, taxa[k], { base, cambio: regraCambio(k) }),
        ),
      )
    : [];
  return db.$transaction(
    async (tx) => {
      const rec = await tx.reconciliation.create({
        data: {
          orgId,
          name: input.name.slice(0, 120),
          bankFileName: input.bankFileName,
          bankFormat: input.bankFormat,
          expectedFileName: input.expectedFileName,
          bankFileSha256: fontes?.banco.sha256,
          expectedFileSha256: fontes?.esperados.sha256,
          totalExpected: expected.reduce((a, e) => a + e.amount, 0),
          totalReceived: entries.reduce((a, e) => a + e.amount, 0),
          totalExcess: excess,
          currency: base,
          options: { ...options, taxas, ...(cambioInfo ? { cambio: cambioInfo } : {}) } as unknown as Prisma.InputJsonValue,
          ...counts,
        },
      });
      // Campos mapeados um a um: índices e origem dos lançamentos não vão para a tabela
      const rows: Prisma.ReconciliationItemCreateManyInput[] = items.map((i, k) => ({
        reconciliationId: rec.id,
        reference: i.reference,
        payer: i.payer,
        expectedAmount: i.expectedAmount,
        receivedAmount: i.receivedAmount,
        paidAt: i.paidAt,
        dueAt: i.dueAt,
        status: i.status,
        rule: i.rule,
        excess: i.excess,
        note: i.note,
        formaPagamento: taxa[k].formaPagamento,
        taxaEsperada: taxa[k].taxaEsperada,
        explicadoTaxa: taxa[k].explicadoTaxa,
        amountOriginal: cambioInfo && i.receivedIndex !== undefined ? originais[i.receivedIndex] / 100 : undefined,
        explicadoCambio: porCambio[k],
        evidence: provas[k] as unknown as Prisma.InputJsonValue | undefined,
      }));
      for (let k = 0; k < rows.length; k += LOTE) await tx.reconciliationItem.createMany({ data: rows.slice(k, k + LOTE) });
      return { rec, itemCount: items.length, explicadosTaxa, explicadosCambio, cambio: cambioInfo, summary: { ...counts, excess } };
    },
    { timeout: 60_000 },
  );
}
