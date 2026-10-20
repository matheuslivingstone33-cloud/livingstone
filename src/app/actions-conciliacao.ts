"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, requireSession } from "@/lib/auth";
import { BankFileError, parseBankFile, parseExpectedCsv, type ReconcileOptions } from "@/lib/reconcile";
import { getSettings } from "@/lib/settings";
import { decodeText, readUpload } from "@/lib/upload";
import { fail } from "@/lib/errors";
import { persistReconciliation } from "@/lib/servicos/conciliacao";

// Inteiro dentro da faixa; campo vazio vale 0
function intIn(form: FormData, name: string, max: number, label: string, back: string) {
  const raw = String(form.get(name) ?? "").trim();
  const n = raw ? Number(raw) : 0;
  if (!Number.isInteger(n) || n < 0 || n > max) fail(back, `${label} deve ser um número inteiro de 0 a ${max}.`);
  return n;
}

export async function createReconciliation(form: FormData) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const back = "/conciliacao";
  const bank = await readUpload(form.get("bankFile"), ["text"]).catch((e: Error) => fail(back, e.message));
  const exp = await readUpload(form.get("expectedFile"), ["text"]).catch((e: Error) => fail(back, e.message));
  if (!bank || !exp) fail(back, "Envie os dois arquivos.");

  const options: ReconcileOptions = {
    toleranciaCentavos: intIn(form, "toleranciaCentavos", 100, "A tolerância de centavos", back),
    casarPorValorData: form.get("casarPorValorData") === "on",
    toleranciaDias: intIn(form, "toleranciaDias", 10, "A tolerância de dias", back),
  };

  const cfg = await getSettings(s.orgId);
  let parsed: ReturnType<typeof parseBankFile>;
  try {
    parsed = parseBankFile(bank.name, decodeText(bank.data), cfg.cnab400);
  } catch (e) {
    fail(back, e instanceof BankFileError ? e.message : "Não foi possível ler o arquivo do banco.");
  }
  const { format, entries } = parsed;
  const expected = parseExpectedCsv(decodeText(exp.data));
  if (!expected.length) fail(back, "Nenhum título válido na lista de esperados. Confira as colunas referencia e valor.");
  const { rec, itemCount } = await persistReconciliation(s.orgId, {
    name: String(form.get("name") || `Conciliação ${new Date().toLocaleDateString("pt-BR")}`),
    bankFileName: bank.name,
    bankFormat: format,
    expectedFileName: exp.name,
    expected,
    entries,
    options,
  });
  await audit(s, "conciliacao.criar", `${rec.name} (${format}, ${itemCount} itens, regras ${JSON.stringify(options)})`);
  revalidatePath("/conciliacao");
  redirect(`/conciliacao/${rec.id}`);
}
