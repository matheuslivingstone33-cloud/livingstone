// Persistência da conciliação, compartilhada pela tela (server action) e pela API.
import { db } from "@/lib/db";
import { reconcileWith, summarize, type BankEntry, type ExpectedEntry, type ReconcileOptions } from "@/lib/reconcile";

export type PersistInput = {
  name: string;
  bankFileName: string;
  bankFormat: string;
  expectedFileName: string;
  expected: ExpectedEntry[];
  entries: BankEntry[];
  options: ReconcileOptions;
};

export async function persistReconciliation(orgId: string, input: PersistInput) {
  const { expected, entries, options } = input;
  const items = reconcileWith(expected, entries, options);
  const { excess, ...counts } = summarize(items);
  const rec = await db.reconciliation.create({
    data: {
      orgId,
      name: input.name.slice(0, 120),
      bankFileName: input.bankFileName,
      bankFormat: input.bankFormat,
      expectedFileName: input.expectedFileName,
      totalExpected: expected.reduce((a, e) => a + e.amount, 0),
      totalReceived: entries.reduce((a, e) => a + e.amount, 0),
      totalExcess: excess,
      options,
      ...counts,
      items: { create: items },
    },
  });
  return { rec, itemCount: items.length, summary: { ...counts, excess } };
}
