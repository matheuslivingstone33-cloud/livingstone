"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { audit, requireSession, type Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtData } from "@/lib/tz";
import { BankFileError, csvHeader, detectBankFormat, parseBankFile, parseExpectedCsv, type BankEntry, type Cnab400Layout, type ExpectedEntry, type ReconcileOptions } from "@/lib/reconcile";
import { getSettings } from "@/lib/settings";
import { UploadError, assertUploadTotal, decodeText, readUpload } from "@/lib/upload";
import type { AiFile } from "@/lib/ai";
import { fail } from "@/lib/errors";
import { persistReconciliation } from "@/lib/servicos/conciliacao";
import { resumoArquivos, sha256Hex, type FonteProva } from "@/lib/prova-conciliacao";
import { sugerirLayoutDaOrg } from "@/lib/servicos/mapeamento";
import { findHeaderLine, readTable, type RawTable } from "@/lib/planilha";
import {
  amostrasPorColuna,
  colunasDoLayout,
  convertWithLayout,
  convertWithLayoutParcial,
  guessLayout,
  headerOf,
  invalidasDoArquivo,
  isLegacyCsv,
  layoutDiff,
  layoutSignature,
  moedaDaTabela,
  moedaDoLayout,
  previewRows,
  validateLayout,
  type Layout,
  type PreviaArquivo,
  type ResumoInvalidas,
  type ResultadoPrevia,
  type TipoLayout,
} from "@/lib/layout-conciliacao";
import { CambioError, SEM_COTACAO, parseCotacao, parseToleranciaPct, type CambioInfo, type Cotacao } from "@/lib/cambio";
import type { Moeda } from "@/lib/moeda";

const BACK = "/conciliacao";
const notaTaxa = (n: number) => (n ? ` · ${n} explicado(s) pela taxa` : "");

// Inteiro dentro da faixa; campo vazio vale 0
function intIn(form: FormData, name: string, max: number, label: string, back: string) {
  const raw = String(form.get(name) ?? "").trim();
  const n = raw ? Number(raw) : 0;
  if (!Number.isInteger(n) || n < 0 || n > max) fail(back, `${label} deve ser um número inteiro de 0 a ${max}.`);
  return n;
}

const optionsOf = (form: FormData): ReconcileOptions => ({
  toleranciaCentavos: intIn(form, "toleranciaCentavos", 100, "A tolerância de centavos", BACK),
  casarPorValorData: form.get("casarPorValorData") === "on",
  toleranciaDias: intIn(form, "toleranciaDias", 10, "A tolerância de dias", BACK),
});

export async function createReconciliation(form: FormData) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const back = BACK;
  try {
    assertUploadTotal([form.get("bankFile"), form.get("expectedFile")]);
  } catch (e) {
    fail(back, (e as Error).message);
  }
  const bank = await readUpload(form.get("bankFile"), ["text"]).catch((e: Error) => fail(back, e.message));
  const exp = await readUpload(form.get("expectedFile"), ["text"]).catch((e: Error) => fail(back, e.message));
  if (!bank || !exp) fail(back, "Envie os dois arquivos.");

  const options = optionsOf(form);
  const cfg = await getSettings(s.orgId);
  let parsed: ReturnType<typeof parseBankFile>;
  try {
    parsed = parseBankFile(bank.name, decodeText(bank.data), cfg.cnab400);
  } catch (e) {
    fail(back, e instanceof BankFileError ? e.message : "Não foi possível ler o arquivo do banco.");
  }
  const { format, entries } = parsed;
  const bankText = decodeText(bank.data);
  const fontes = {
    banco: { arquivo: bank.name, formato: format, sha256: sha256Hex(bank.data), cabecalho: format === "CSV" ? csvHeader(bankText) : undefined },
    esperados: { arquivo: exp.name, formato: "CSV", sha256: sha256Hex(exp.data), cabecalho: csvHeader(decodeText(exp.data)) },
  };
  let expected: ReturnType<typeof parseExpectedCsv>;
  try {
    expected = parseExpectedCsv(decodeText(exp.data));
  } catch (e) {
    fail(back, e instanceof BankFileError ? e.message : "Não foi possível ler a lista de esperados.");
  }
  if (!expected.length) fail(back, "Nenhum título válido na lista de esperados. Confira as colunas referencia e valor.");
  const { rec, itemCount, explicadosTaxa } = await persistReconciliation(s.orgId, {
    name: String(form.get("name") || `Conciliação ${fmtData(new Date())}`),
    bankFileName: bank.name,
    bankFormat: format,
    expectedFileName: exp.name,
    expected,
    entries,
    options,
    fontes,
    cnab400: cfg.cnab400,
    taxas: cfg.conciliacao.taxas,
  });
  await audit(s, "conciliacao.criar", `${rec.name} (${format}, ${itemCount} itens, regras ${JSON.stringify(options)})${notaTaxa(explicadosTaxa)}${resumoArquivos(fontes)}`);
  revalidatePath("/conciliacao");
  redirect(`/conciliacao/${rec.id}`);
}

// ---------- Planilhas em qualquer formato (layout de colunas por instituição) ----------

type Pronto = { modo: "pronto"; tipo: TipoLayout; nome: string; formato: string; entries: ExpectedEntry[] | BankEntry[]; layoutId?: string; fonte: FonteProva; moeda: Moeda; invalidas?: ResumoInvalidas };
type SemLayout = { modo: "layout"; tipo: TipoLayout; nome: string; tabela: RawTable; header: string[]; linha: number; assinatura: string; sha256: string };

const ROTULO: Record<TipoLayout, string> = { esperados: "títulos esperados", extrato: "arquivo do banco" };
const CAMPO_FORM: Record<TipoLayout, string> = { esperados: "expectedFile", extrato: "bankFile" };
const CAMPO_LAYOUT: Record<TipoLayout, string> = { esperados: "layoutEsperados", extrato: "layoutExtrato" };

const erroDe = (e: unknown, tipo: TipoLayout) =>
  e instanceof BankFileError || e instanceof UploadError ? e.message : `Não foi possível ler o ${ROTULO[tipo]}.`;

/** Extrato tolera linhas inválidas (ficam registradas); a lista de esperados continua bloqueando. */
function converter(t: RawTable, layout: Layout): { entries: ExpectedEntry[] | BankEntry[]; invalidas?: ResumoInvalidas } {
  if (layout.tipo === "extrato") return convertWithLayoutParcial(t, layout);
  return { entries: convertWithLayout(t, layout) };
}

/** OFX/CNAB e CSV no formato antigo seguem os leitores de sempre; o resto vira grade e procura o layout salvo. */
async function lerArquivo(orgId: string, tipo: TipoLayout, f: AiFile, cnab400: Cnab400Layout): Promise<Pronto | SemLayout> {
  // Hash do arquivo como chegou (bytes originais); o arquivo em si não é guardado
  const sha256 = sha256Hex(f.data);
  if (f.mime === "text/plain") {
    const text = decodeText(f.data);
    if (tipo === "extrato" && detectBankFormat(f.name, text) !== "CSV") {
      const p = parseBankFile(f.name, text, cnab400);
      // OFX e CNAB são de bancos brasileiros: sempre em real
      return { modo: "pronto", tipo, nome: f.name, formato: p.format, entries: p.entries, fonte: { arquivo: f.name, formato: p.format, sha256 }, moeda: "BRL" };
    }
    if (isLegacyCsv(tipo, text)) {
      const entries = tipo === "esperados" ? parseExpectedCsv(text) : parseBankFile(f.name, text, cnab400).entries;
      return { modo: "pronto", tipo, nome: f.name, formato: "CSV", entries, fonte: { arquivo: f.name, formato: "CSV", sha256, cabecalho: csvHeader(text) }, moeda: "BRL" };
    }
  }
  const tabela = await readTable(f.name, f.data);
  const linha = findHeaderLine(tabela.linhas);
  const header = headerOf(tabela.linhas, linha);
  const assinatura = layoutSignature(tipo, header);
  const salvo = await db.reconLayout.findFirst({ where: { orgId, assinatura } });
  if (salvo) {
    // O que veio do banco é conferido de novo contra o cabeçalho deste arquivo
    const v = validateLayout(salvo.layout, header);
    if (v.ok && v.layout.tipo === tipo && v.layout.linhaCabecalho === linha)
      return {
        modo: "pronto", tipo, nome: f.name, formato: tabela.formato, ...converter(tabela, v.layout), layoutId: salvo.id,
        fonte: { arquivo: f.name, formato: tabela.formato, sha256, cabecalho: header, colunas: colunasDoLayout(v.layout, header) },
        moeda: moedaDoLayout(v.layout),
      };
  }
  return { modo: "layout", tipo, nome: f.name, tabela, header, linha, assinatura, sha256 };
}

async function lerDois(s: Session, form: FormData) {
  assertUploadTotal([form.get("bankFile"), form.get("expectedFile")]);
  const cfg = await getSettings(s.orgId);
  const out: Partial<Record<TipoLayout, Pronto | SemLayout>> = {};
  for (const tipo of ["extrato", "esperados"] as TipoLayout[]) {
    const f = await readUpload(form.get(CAMPO_FORM[tipo]), tipo === "extrato" ? ["text", "xlsx"] : ["text", "xlsx"]);
    if (!f) throw new UploadError("Envie os dois arquivos.");
    try {
      out[tipo] = await lerArquivo(s.orgId, tipo, f, cfg.cnab400);
    } catch (e) {
      throw new BankFileError(erroDe(e, tipo));
    }
  }
  return out as Record<TipoLayout, Pronto | SemLayout>;
}

/** Layout enviado pela tela: o servidor fixa tipo, linha do cabeçalho e separador pelo que ele mesmo detectou. */
function layoutDoForm(form: FormData, a: SemLayout): { ok: true; layout: Layout } | { ok: false; erro: string } {
  const raw = String(form.get(CAMPO_LAYOUT[a.tipo]) ?? "");
  if (!raw) return { ok: false, erro: `Confirme as colunas do ${ROTULO[a.tipo]}.` };
  let x: unknown;
  try {
    x = JSON.parse(raw.slice(0, 5_000));
  } catch {
    return { ok: false, erro: "Layout ilegível." };
  }
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, erro: "Layout ilegível." };
  const o = x as Record<string, unknown>;
  const montado: Record<string, unknown> = { tipo: a.tipo, colunas: o.colunas, formatoData: o.formatoData, formatoValor: o.formatoValor, linhaCabecalho: a.linha };
  // Moeda escolhida pelo usuário (vazio = ainda não escolhida)
  if (o.moeda !== undefined && o.moeda !== "") montado.moeda = o.moeda;
  if (a.tabela.separador) montado.separador = a.tabela.separador;
  return validateLayout(montado, a.header);
}

/** Perguntas de formato (data/valor) que a amostra deixa em aberto, pela mesma heurística da sugestão. */
const perguntasDe = (a: SemLayout) => guessLayout(a.tipo, a.header, a.tabela, a.linha).perguntas;

type CambioForm = { cotacao: Cotacao; toleranciaPct: number; informadaPor: string };

/** Câmbio da tela: obrigatório só quando as moedas diferem. A cotação é sempre digitada pelo usuário. */
function cambioDoForm(form: FormData, s: Session, esp: Moeda, ext: Moeda): { ok: true; cambio?: CambioForm } | { ok: false; erro: string } {
  if (esp === ext) return { ok: true };
  const raw = String(form.get("cotacao") ?? "").trim();
  if (!raw) return { ok: false, erro: SEM_COTACAO };
  const cotacao = parseCotacao(raw.slice(0, 20));
  if (!cotacao) return { ok: false, erro: "Cotação inválida: use um número positivo com até 6 casas decimais (ex.: 5,4321)." };
  const toleranciaPct = parseToleranciaPct(String(form.get("toleranciaCambioPct") ?? "").trim().slice(0, 10));
  if (toleranciaPct === null) return { ok: false, erro: "Tolerância de câmbio inválida: use de 0 a 10%, com até 2 casas decimais." };
  return { ok: true, cambio: { cotacao, toleranciaPct, informadaPor: s.name } };
}

const notaCambio = (c: CambioInfo | undefined, n: number) =>
  c ? ` · moedas esperados ${c.moedaEsperados} / extrato ${c.moedaExtrato}, base ${c.base}, cotação ${c.cotacao} (tolerância ${c.toleranciaPct}%) informada por ${c.informadaPor}${n ? `, ${n} com diferença de câmbio` : ""}` : "";

async function persistir(s: Session, form: FormData, esp: Pronto, ext: Pronto, extra = ""): Promise<never> {
  const options = optionsOf(form);
  const cx = cambioDoForm(form, s, esp.moeda, ext.moeda);
  if (!cx.ok) fail(BACK, cx.erro);
  const expected = esp.entries as ExpectedEntry[];
  if (!expected.length) fail(BACK, "Nenhum título válido na lista de esperados.");
  const fontes = { esperados: esp.fonte, banco: ext.fonte };
  const { cnab400, conciliacao } = await getSettings(s.orgId);
  let r: Awaited<ReturnType<typeof persistReconciliation>>;
  try {
    r = await persistReconciliation(s.orgId, {
      name: String(form.get("name") || `Conciliação ${fmtData(new Date())}`),
      bankFileName: ext.nome,
      bankFormat: ext.formato,
      expectedFileName: esp.nome,
      expected,
      entries: ext.entries as BankEntry[],
      options,
      fontes,
      cnab400,
      taxas: conciliacao.taxas,
      moedas: { esperados: esp.moeda, extrato: ext.moeda },
      cambio: cx.cambio,
      linhasInvalidas: ext.invalidas,
    });
  } catch (e) {
    if (e instanceof CambioError) fail(BACK, e.message);
    throw e;
  }
  const { rec, itemCount, explicadosTaxa, explicadosCambio, cambio } = r;
  for (const p of [esp, ext])
    if (p.layoutId) await audit(s, "conciliacao.conversao", `${ROTULO[p.tipo]} (${p.formato}) convertido pelo layout salvo ${p.layoutId}: ${p.entries.length} linha(s)${p.invalidas?.total ? `, ${p.invalidas.total} não lida(s)` : ""}`);
  await audit(s, "conciliacao.criar", `${rec.name} (${ext.formato}, ${itemCount} itens, regras ${JSON.stringify(options)})${extra}${ext.invalidas?.total ? ` · ${ext.invalidas.total} linha(s) do extrato não lida(s)` : ""}${notaTaxa(explicadosTaxa)}${notaCambio(cambio, explicadosCambio)}${resumoArquivos(fontes)}`);
  revalidatePath(BACK);
  redirect(`/conciliacao/${rec.id}`);
}

/**
 * Envio dos dois arquivos. Se ambos já são legíveis (OFX/CNAB, CSV antigo ou layout salvo), concilia direto.
 * Senão devolve a prévia das colunas (heurística; IA só se houver dúvida) para o usuário confirmar.
 * Se a tela mandar um layout (o usuário mexeu nos campos), a prévia usa esse layout e não chama a IA.
 */
export async function previewReconciliation(form: FormData): Promise<ResultadoPrevia> {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  let lidos: Record<TipoLayout, Pronto | SemLayout>;
  try {
    lidos = await lerDois(s, form);
  } catch (e) {
    return { ok: false, erro: e instanceof Error && (e instanceof BankFileError || e instanceof UploadError) ? e.message : "Não foi possível ler os arquivos." };
  }
  const { esperados, extrato } = lidos;
  const moedasFixas: Partial<Record<TipoLayout, Moeda>> = {};
  for (const a of [esperados, extrato]) if (a.modo === "pronto") moedasFixas[a.tipo] = a.moeda;
  if (esperados.modo === "pronto" && extrato.modo === "pronto") {
    // Moedas diferentes e nenhuma cotação digitada: a tela pede a cotação antes de conciliar
    if (esperados.moeda !== extrato.moeda && !String(form.get("cotacao") ?? "").trim()) return { ok: true, previas: [], moedasFixas, precisaCotacao: true };
    return persistir(s, form, esperados, extrato);
  }

  const previas: PreviaArquivo[] = [];
  for (const a of [extrato, esperados]) {
    if (a.modo !== "layout") continue;
    const base = { tipo: a.tipo, arquivo: a.nome, cabecalho: a.header, amostras: amostrasPorColuna(a.tabela, a.linha, 3) };
    if (form.get(CAMPO_LAYOUT[a.tipo])) {
      const v = layoutDoForm(form, a);
      previas.push(
        v.ok
          ? {
              ...base, colunas: v.layout.colunas, formatoData: v.layout.formatoData, formatoValor: v.layout.formatoValor, moeda: v.layout.moeda,
              // As perguntas de formato continuam na tela depois de "Atualizar prévia"
              ...(perguntasDe(a) ? { perguntas: perguntasDe(a) } : {}),
              confianca: "baixa", origem: "usuario", motivos: [], linhas: previewRows(a.tabela, v.layout, 10),
              ...(a.tipo === "extrato" ? { invalidas: invalidasDoArquivo(a.tabela, v.layout, 20) } : {}),
            }
          : { ...base, colunas: {}, confianca: "baixa", origem: "usuario", motivos: [], linhas: [], erro: v.erro },
      );
      continue;
    }
    const r = await sugerirLayoutDaOrg(s.orgId, a.tipo, a.tabela, a.linha);
    if (r.status === "rejeitada") await audit(s, "ia.rejeitada", `Mapeamento de planilha: ${r.motivo ?? ""}`.slice(0, 500));
    if (r.status === "falhou") await audit(s, "ia.falhou", `Mapeamento de planilha: ${r.motivo ?? ""}`.slice(0, 500));
    if (r.status === "bloqueada_limite") await audit(s, "ia.limite", "Mapeamento de planilha: teto diário de IA atingido");
    // Só metadados: nenhum nome de coluna nem conteúdo do arquivo vai para a auditoria
    await audit(s, "conciliacao.layout_sugerido", `${ROTULO[a.tipo]} (${a.tabela.formato}, ${a.header.length} colunas): origem ${r.origem}, confiança ${r.sugestao.confianca}`);
    previas.push({
      ...base,
      colunas: r.layout?.colunas ?? r.sugestao.layout,
      formatoData: r.layout?.formatoData ?? r.sugestao.formatoData,
      formatoValor: r.layout?.formatoValor ?? r.sugestao.formatoValor,
      // Moeda só pelos símbolos da planilha; a IA nunca define moeda nem cotação
      moeda: moedaDaTabela(a.tabela, a.linha),
      ...(r.sugestao.perguntas ? { perguntas: r.sugestao.perguntas } : {}),
      confianca: r.sugestao.confianca,
      origem: r.origem,
      motivos: r.sugestao.motivos,
      linhas: r.layout ? previewRows(a.tabela, r.layout, 10) : [],
      ...(r.layout && a.tipo === "extrato" ? { invalidas: invalidasDoArquivo(a.tabela, r.layout, 20) } : {}),
    });
  }
  return { ok: true, previas, moedasFixas };
}

/** Confirmação na tela: revalida o layout contra o cabeçalho recalculado aqui, salva para a instituição e concilia. */
export async function confirmLayoutAndReconcile(form: FormData): Promise<ResultadoPrevia> {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  let lidos: Record<TipoLayout, Pronto | SemLayout>;
  try {
    lidos = await lerDois(s, form);
  } catch (e) {
    return { ok: false, erro: e instanceof BankFileError || e instanceof UploadError ? e.message : "Não foi possível ler os arquivos." };
  }
  const prontos: Partial<Record<TipoLayout, Pronto>> = {};
  const notas: string[] = [];
  for (const tipo of ["extrato", "esperados"] as TipoLayout[]) {
    const a = lidos[tipo];
    if (a.modo === "pronto") {
      prontos[tipo] = a;
      continue;
    }
    const v = layoutDoForm(form, a);
    if (!v.ok) return { ok: false, erro: `${ROTULO[tipo]}: ${v.erro}` };
    if (!v.layout.moeda) return { ok: false, erro: `${ROTULO[tipo]}: informe se a planilha está em real ou em dólar.` };
    let conv: ReturnType<typeof converter>;
    try {
      conv = converter(a.tabela, v.layout);
    } catch (e) {
      return { ok: false, erro: erroDe(e, tipo) };
    }
    const antigo = await db.reconLayout.findFirst({ where: { orgId: s.orgId, assinatura: a.assinatura } });
    const salvo = await db.reconLayout.upsert({
      where: { orgId_assinatura: { orgId: s.orgId, assinatura: a.assinatura } },
      create: { orgId: s.orgId, tipo, assinatura: a.assinatura, cabecalho: a.header, layout: v.layout as unknown as Prisma.InputJsonValue, criadoPor: s.name.slice(0, 120) },
      update: { layout: v.layout as unknown as Prisma.InputJsonValue, cabecalho: a.header },
    });
    if (antigo) {
      const anterior = validateLayout(antigo.layout, a.header);
      const diff = anterior.ok ? layoutDiff(anterior.layout, v.layout) : ["layout anterior inválido substituído"];
      if (diff.length) await audit(s, "conciliacao.layout_alterado", `${ROTULO[tipo]} (${salvo.id}): ${diff.join("; ")}`.slice(0, 500));
    } else await audit(s, "conciliacao.layout_salvo", `${ROTULO[tipo]} (${salvo.id}, ${a.header.length} colunas)`);
    notas.push(`layout de ${ROTULO[tipo]} confirmado`);
    prontos[tipo] = {
      modo: "pronto", tipo, nome: a.nome, formato: a.tabela.formato, ...conv,
      fonte: { arquivo: a.nome, formato: a.tabela.formato, sha256: a.sha256, cabecalho: a.header, colunas: colunasDoLayout(v.layout, a.header) },
      moeda: moedaDoLayout(v.layout),
    };
  }
  // Moedas diferentes exigem a cotação: devolve o erro à tela em vez de conciliar
  const cx = cambioDoForm(form, s, prontos.esperados!.moeda, prontos.extrato!.moeda);
  if (!cx.ok) return { ok: false, erro: cx.erro };
  revalidatePath(BACK);
  return persistir(s, form, prontos.esperados!, prontos.extrato!, notas.length ? ` · ${notas.join(", ")}` : "");
}

/** Exclui um layout salvo da instituição (o próximo arquivo com esse cabeçalho pede confirmação de novo). */
export async function deleteLayout(form: FormData) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const id = String(form.get("id") ?? "").slice(0, 40);
  const l = await db.reconLayout.findFirst({ where: { id, orgId: s.orgId } });
  if (!l) fail(BACK, "Layout não encontrado.");
  await db.reconLayout.deleteMany({ where: { id: l.id, orgId: s.orgId } });
  await audit(s, "conciliacao.layout_excluido", `${ROTULO[l.tipo as TipoLayout] ?? l.tipo} (${l.id})`);
  revalidatePath(BACK);
}

/** Registra a impressão da prova de um item. Qualquer perfil pode imprimir (é só leitura); fica na auditoria. */
export async function registrarProvaImpressa(recId: string, itemId: string) {
  const s = await requireSession();
  const r = await db.reconciliation.findFirst({ where: { id: String(recId).slice(0, 40), orgId: s.orgId }, select: { id: true } });
  if (!r) return;
  const i = await db.reconciliationItem.findFirst({ where: { id: String(itemId).slice(0, 40), reconciliationId: r.id }, select: { id: true } });
  if (!i) return;
  await audit(s, "conciliacao.prova_impressa", `conciliação ${r.id}, item ${i.id}`);
}
