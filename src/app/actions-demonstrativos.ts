"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit, requireSession } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { ID_RE } from "@/lib/assistente";
import { UploadError, readUpload } from "@/lib/upload";
import { pdfTextoPaginas } from "@/lib/pdf";
import { parseQuickbooksPL } from "@/lib/quickbooks-pl";
import type { Alerta } from "@/lib/plano-contas";
import { gravarDemonstrativo } from "@/lib/demonstrativos-import";
import { isClasse, mensagemErroImportacao, podeConferir } from "@/lib/consolidado";
import type { Linhas } from "@/lib/demonstrativos";

const BACK = "/consolidado";
const ESCRITA = ["ADMIN", "ANALISTA"];


/** Envio do P&L mensal do QuickBooks em PDF. Sem IA; o PDF não é guardado, só o hash. */
export async function importarRelatorio(form: FormData) {
  const s = await requireSession(ESCRITA);
  let arquivo;
  try {
    arquivo = await readUpload(form.get("arquivo"), ["pdf"]);
  } catch (e) {
    if (e instanceof UploadError) fail(BACK, e.message);
    throw e;
  }
  if (!arquivo) fail(BACK, "Escolha o PDF do relatório Profit & Loss.");
  const paginas = await pdfTextoPaginas(arquivo.data);
  if (!paginas.some((p) => p.trim())) fail(BACK, "Não consegui ler o texto do PDF. Exporte o relatório de novo do QuickBooks (PDF digital, sem senha).");
  const r = parseQuickbooksPL(paginas);
  if ("erro" in r) fail(BACK, mensagemErroImportacao(r));

  const hash = createHash("sha256").update(arquivo.data).digest("hex");
  const g = await gravarDemonstrativo(s, r, hash);
  if (!g.ok) fail(BACK, g.erro);
  revalidatePath(BACK);
  redirect(`${BACK}/${g.id}`);
}

/** Salva as classes da tela de classificação (campos "classe::<conta>"). */
export async function salvarClassificacao(form: FormData) {
  const s = await requireSession(ESCRITA);
  const VOLTA = `${BACK}/classificacao`;
  const pedidas = [...form.entries()].filter(([k]) => k.startsWith("classe::")).map(([k, v]) => [k.slice(8), v] as const);
  if (pedidas.length > 5000) fail(VOLTA, "Contas demais num único envio.");
  for (const [, v] of pedidas) if (!isClasse(v)) fail(VOLTA, "Classe inválida. Use Fixo, Variável, Fora do cálculo ou Não classificada.");
  const atuais = new Map((await db.classificacaoConta.findMany({ where: { orgId: s.orgId }, select: { conta: true, classe: true } })).map((r) => [r.conta, r.classe]));
  for (const [conta] of pedidas) if (!atuais.has(conta)) fail(VOLTA, "Conta não encontrada. Atualize a página e tente de novo.");
  const mudou = pedidas.filter(([conta, v]) => atuais.get(conta) !== v);
  for (const [conta, classe] of mudou) await db.classificacaoConta.updateMany({ where: { orgId: s.orgId, conta }, data: { classe: classe as string, updatedBy: s.userId } });
  await audit(s, "demonstrativo.classificacao", `${mudou.length} contas alteradas`);
  revalidatePath(BACK, "layout");
  redirect(`${VOLTA}?ok=1`);
}

/** Marca o mês como CONFERIDO. Aceita o aceite como booleano ou pelo formulário (campo "aceite"). */
export async function conferirPeriodo(id: string, aceite: boolean | FormData) {
  const s = await requireSession(ESCRITA);
  if (typeof id !== "string" || !ID_RE.test(id)) fail(BACK, "Mês não encontrado.");
  const volta = `${BACK}/${id}`;
  const p = await db.demonstrativoPeriodo.findFirst({ where: { id, orgId: s.orgId }, select: { id: true, ano: true, mes: true, status: true, linhas: true, alertas: true } });
  if (!p) fail(BACK, "Mês não encontrado.");
  if (p.status === "CONFERIDO") redirect(volta);
  const aceitou = typeof aceite === "boolean" ? aceite : aceite.get("aceite") === "on";
  const v = podeConferir((p.linhas ?? {}) as Linhas, (Array.isArray(p.alertas) ? p.alertas : []) as Alerta[], aceitou);
  if (!v.ok)
    fail(volta, v.problema === "identidades" ? "As somas do relatório não fecham. Confira o PDF e envie de novo." : "Marque que você leu os pontos de atenção antes de conferir.");
  const up = await db.demonstrativoPeriodo.updateMany({
    where: { id: p.id, orgId: s.orgId, status: "RASCUNHO" },
    data: { status: "CONFERIDO", conferidoPor: s.userId, conferidoEm: new Date(), aceiteAlertas: aceitou },
  });
  if (up.count !== 1) fail(volta, "O mês mudou enquanto você conferia. Atualize a página.");
  await audit(s, "demonstrativo.conferido", `${String(p.mes).padStart(2, "0")}/${p.ano}`);
  revalidatePath(BACK, "layout");
  redirect(volta);
}

/** Volta o mês para RASCUNHO (permite reenviar o relatório). */
export async function reabrirPeriodo(id: string) {
  const s = await requireSession(ESCRITA);
  if (typeof id !== "string" || !ID_RE.test(id)) fail(BACK, "Mês não encontrado.");
  const p = await db.demonstrativoPeriodo.findFirst({ where: { id, orgId: s.orgId }, select: { id: true, ano: true, mes: true } });
  if (!p) fail(BACK, "Mês não encontrado.");
  await db.demonstrativoPeriodo.updateMany({
    where: { id: p.id, orgId: s.orgId },
    data: { status: "RASCUNHO", conferidoPor: null, conferidoEm: null, aceiteAlertas: false },
  });
  await audit(s, "demonstrativo.reaberto", `${String(p.mes).padStart(2, "0")}/${p.ano}`);
  revalidatePath(BACK, "layout");
  redirect(`${BACK}/${p.id}`);
}
