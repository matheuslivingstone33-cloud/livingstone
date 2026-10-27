// Persistência da conciliação, compartilhada pela tela (server action) e pela API.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reconcileWith, summarize, type BankEntry, type Cnab400Layout, type ExpectedEntry, type ReconcileOptions } from "@/lib/reconcile";
import { limitarTotal, montarProva, type FonteProva } from "@/lib/prova-conciliacao";
import { classificarTaxa, type TaxaRecebimento } from "@/lib/taxa-recebimento";

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
};

const LOTE = 1000;

export async function persistReconciliation(orgId: string, input: PersistInput) {
  const { expected, entries, options, fontes } = input;
  const taxas = input.taxas ?? [];
  const items = reconcileWith(expected, entries, options);
  const { excess, ...counts } = summarize(items);
  // A taxa só acrescenta a pista: status e contagens vêm da conciliação acima, sem mudança
  const taxa = items.map((i) => classificarTaxa(i, i.expectedIndex !== undefined ? expected[i.expectedIndex]?.forma : undefined, taxas));
  const explicadosTaxa = taxa.filter((t) => t.explicadoTaxa).length;
  const provas = fontes
    ? limitarTotal(items.map((i, k) => montarProva(i, { ...fontes.esperados, entries: expected }, { ...fontes.banco, entries }, { ...options, cnab400: input.cnab400 }, taxa[k])))
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
          options: { ...options, taxas } as unknown as Prisma.InputJsonValue,
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
        evidence: provas[k] as unknown as Prisma.InputJsonValue | undefined,
      }));
      for (let k = 0; k < rows.length; k += LOTE) await tx.reconciliationItem.createMany({ data: rows.slice(k, k + LOTE) });
      return { rec, itemCount: items.length, explicadosTaxa, summary: { ...counts, excess } };
    },
    { timeout: 60_000 },
  );
}
