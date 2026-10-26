// Validação do corpo JSON da API de conciliação e conversão para os tipos de reconcile.ts. Puro: sem banco nem Next.
import { BankFileError, REF_MAX, csvHeader, detectBankFormat, normRef, parseBankFile, utcDay, type BankEntry, type Cnab400Layout, type ExpectedEntry, type ReconcileOptions } from "./reconcile";
import { decodeText } from "./upload";
import { formatBytes } from "./upload-limits";
import { findHeaderLine, readTable, type RawTable } from "./planilha";
import { jsonCanonico, sha256Hex, type FonteProva } from "./prova-conciliacao";
import { colunasDoLayout, convertWithLayout, headerOf, layoutSignature, validateLayout, type Layout, type TipoLayout } from "./layout-conciliacao";

export type FieldError = { campo: string; mensagem: string };

// arquivoBytes: em base64 (x4/3) mais o JSON precisa caber em API_MAX_BODY_BYTES (4 MB)
export const API_LIMITS = { esperados: 20_000, lancamentos: 20_000, arquivoBytes: 2_900_000 } as const;

export type ReconciliationInput = {
  name: string;
  expected: ExpectedEntry[];
  expectedFileName: string;
  bankFileName: string;
  bankFormat: string;
  entries: BankEntry[];
  options: ReconcileOptions;
  /** Para a prova: hash do arquivo enviado (ou do JSON canônico da lista) e cabeçalho. */
  fontes: { esperados: FonteProva; banco: FonteProva };
};

/** status 422: planilha sem layout salvo na instituição. */
type Result = { ok: true; value: ReconciliationInput } | { ok: false; errors: FieldError[]; status?: 422 };

export const SEM_LAYOUT = "Layout não cadastrado; envie uma vez pela tela.";
export type ApiFileField = "arquivoEsperados" | "arquivoBanco";
/** Planilhas já lidas do corpo (a leitura de .xlsx é assíncrona; a validação continua síncrona e pura). */
export type ApiTables = Map<ApiFileField, RawTable | FieldError>;
export type ApiContext = { layouts?: Map<string, Layout>; tables?: ApiTables };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// Referência sem truncar: acima do limite é erro (truncar poderia casar títulos diferentes)
function refOf(v: unknown, campo: string, errors: FieldError[]) {
  const r = typeof v === "string" ? v.trim() : "";
  if (r.length > REF_MAX) errors.push({ campo, mensagem: `No máximo ${REF_MAX} caracteres.` });
  return r;
}

/** Data estrita AAAA-MM-DD (rejeita 2026-02-30) */
export function parseIsoDay(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return utcDay(+m[1], +m[2], +m[3]) ?? null;
}

// Valor em reais com no máximo 2 casas, positivo e abaixo de 1 trilhão (cabe em Decimal(14,2))
const validAmount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e12 && Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

function intRange(v: unknown, max: number, campo: string, errors: FieldError[]) {
  if (v === undefined) return 0;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max) {
    errors.push({ campo, mensagem: `Deve ser um número inteiro de 0 a ${max}.` });
    return 0;
  }
  return v;
}

const B64 = /^[A-Za-z0-9+/\r\n]+={0,2}\s*$/;
const cleanName = (v: unknown) => str(v, 200).replace(/[^\w.\- ()À-ú]/g, "_").slice(0, 120);

/** { nome, base64 } → bytes, com o mesmo limite de banco.arquivo. */
export function decodeApiFile(v: unknown, campo: string): { nome: string; buf: Buffer } | FieldError {
  if (!isObj(v)) return { campo, mensagem: "Deve ser um objeto { nome, base64 }." };
  const nome = cleanName(v.nome);
  if (!nome) return { campo: `${campo}.nome`, mensagem: "Informe o nome do arquivo (ex.: titulos.xlsx)." };
  if (typeof v.base64 !== "string" || !v.base64 || !B64.test(v.base64)) return { campo: `${campo}.base64`, mensagem: "Conteúdo em base64 obrigatório." };
  const buf = Buffer.from(v.base64, "base64");
  if (buf.length > API_LIMITS.arquivoBytes) return { campo: `${campo}.base64`, mensagem: `Arquivo acima de ${formatBytes(API_LIMITS.arquivoBytes)}.` };
  return { nome, buf };
}

const isFieldError = (x: unknown): x is FieldError => isObj(x) && typeof x.campo === "string" && typeof x.mensagem === "string";

/** Lê as planilhas de arquivoEsperados/arquivoBanco (CSV ou .xlsx). OFX/CNAB em arquivoBanco ficam para os leitores atuais. */
export async function readApiTables(body: unknown): Promise<ApiTables> {
  const out: ApiTables = new Map();
  if (!isObj(body)) return out;
  for (const campo of ["arquivoEsperados", "arquivoBanco"] as ApiFileField[]) {
    if (body[campo] === undefined) continue;
    const f = decodeApiFile(body[campo], campo);
    if (isFieldError(f)) continue;
    if (campo === "arquivoBanco" && !f.buf.includes(0) && detectBankFormat(f.nome, decodeText(f.buf)) !== "CSV") continue;
    try {
      out.set(campo, await readTable(f.nome, f.buf));
    } catch (e) {
      out.set(campo, { campo, mensagem: e instanceof BankFileError ? e.message : "Não foi possível ler o arquivo." });
    }
  }
  return out;
}

/** Planilha → lançamentos pelo layout salvo da instituição (nunca chama IA). */
function fromTable(tipo: TipoLayout, campo: ApiFileField, ctx: ApiContext, errors: FieldError[], flags: { semLayout: boolean }) {
  const t = ctx.tables?.get(campo);
  if (!t) return void errors.push({ campo, mensagem: "Não foi possível ler o arquivo." });
  if (isFieldError(t)) return void errors.push(t);
  const linha = findHeaderLine(t.linhas);
  const header = headerOf(t.linhas, linha);
  const layout = ctx.layouts?.get(layoutSignature(tipo, header));
  const v = layout ? validateLayout(layout, header) : undefined;
  if (!v || !v.ok || v.layout.tipo !== tipo || v.layout.linhaCabecalho !== linha) {
    flags.semLayout = true;
    return void errors.push({ campo, mensagem: SEM_LAYOUT });
  }
  try {
    return { entries: convertWithLayout(t, v.layout), formato: t.formato, cabecalho: header, colunas: colunasDoLayout(v.layout, header) };
  } catch (e) {
    errors.push({ campo, mensagem: e instanceof BankFileError ? e.message : "Não foi possível converter o arquivo." });
  }
}

export function validateReconciliationBody(body: unknown, cnab400?: Cnab400Layout, ctx: ApiContext = {}): Result {
  const errors: FieldError[] = [];
  const flags = { semLayout: false };
  if (!isObj(body)) return { ok: false, errors: [{ campo: "", mensagem: "O corpo deve ser um objeto JSON." }] };

  const name = str(body.nome, 120);
  if (!name) errors.push({ campo: "nome", mensagem: "Informe o nome da conciliação." });

  // Esperados: lista JSON ou planilha (arquivoEsperados) com layout salvo
  let expected: ExpectedEntry[] = [];
  let expectedFileName = "api.json";
  let fonteEsp: Omit<FonteProva, "arquivo"> = { formato: "JSON", sha256: "" };
  const esp = body.esperados;
  if (esp !== undefined && body.arquivoEsperados !== undefined) errors.push({ campo: "esperados", mensagem: "Envie exatamente um: esperados ou arquivoEsperados." });
  else if (body.arquivoEsperados !== undefined) {
    const f = decodeApiFile(body.arquivoEsperados, "arquivoEsperados");
    if (isFieldError(f)) errors.push(f);
    else {
      expectedFileName = f.nome;
      const r = fromTable("esperados", "arquivoEsperados", ctx, errors, flags);
      if (r) {
        expected = r.entries as ExpectedEntry[];
        fonteEsp = { formato: r.formato, sha256: sha256Hex(f.buf), cabecalho: r.cabecalho, colunas: r.colunas };
      }
    }
  } else if (!Array.isArray(esp) || esp.length === 0) errors.push({ campo: "esperados", mensagem: "Envie ao menos um título esperado." });
  else if (esp.length > API_LIMITS.esperados) errors.push({ campo: "esperados", mensagem: `No máximo ${API_LIMITS.esperados} títulos por conciliação.` });
  else {
    fonteEsp = { formato: "JSON", sha256: sha256Hex(jsonCanonico(esp)) };
    const seen = new Map<string, number>();
    esp.forEach((e, i) => {
      const at = `esperados[${i}]`;
      if (errors.length >= 50) return;
      if (!isObj(e)) return void errors.push({ campo: at, mensagem: "Deve ser um objeto." });
      const reference = refOf(e.referencia, `${at}.referencia`, errors);
      if (!reference) errors.push({ campo: `${at}.referencia`, mensagem: "Obrigatória." });
      else {
        // Títulos esperados com a mesma referência normalizada tornariam a conciliação ambígua
        const k = normRef(reference);
        const j = seen.get(k);
        if (j !== undefined) errors.push({ campo: `${at}.referencia`, mensagem: `Referência repetida (mesma de esperados[${j}]).` });
        else seen.set(k, i);
      }
      if (!validAmount(e.valor)) errors.push({ campo: `${at}.valor`, mensagem: "Número positivo em reais, com até 2 casas decimais." });
      const dueAt = parseIsoDay(e.vencimento);
      if (!dueAt) errors.push({ campo: `${at}.vencimento`, mensagem: "Data no formato AAAA-MM-DD." });
      if (e.pagador !== undefined && e.pagador !== null && typeof e.pagador !== "string") errors.push({ campo: `${at}.pagador`, mensagem: "Deve ser texto." });
      // Prova: linha = índice na lista enviada; o objeto como veio
      expected.push({ reference, payer: str(e.pagador, 120) || undefined, amount: e.valor as number, dueAt: dueAt ?? undefined, origem: { linha: i, bruto: JSON.stringify(e).slice(0, 1000) } });
    });
  }

  // Banco: exatamente um de lancamentos / arquivo
  let entries: BankEntry[] = [];
  let bankFileName = "";
  let bankFormat = "";
  let fonteBanco: Omit<FonteProva, "arquivo" | "formato"> = { sha256: "" };
  const banco = body.banco;
  if (banco !== undefined && body.arquivoBanco !== undefined) errors.push({ campo: "banco", mensagem: "Envie exatamente um: banco ou arquivoBanco." });
  else if (body.arquivoBanco !== undefined) {
    const f = decodeApiFile(body.arquivoBanco, "arquivoBanco");
    if (isFieldError(f)) errors.push(f);
    else {
      bankFileName = f.nome;
      fonteBanco = { sha256: sha256Hex(f.buf) };
      const text = f.buf.includes(0) ? "" : decodeText(f.buf);
      const fmt = text ? detectBankFormat(f.nome, text) : "CSV";
      if (fmt !== "CSV")
        try {
          const parsed = parseBankFile(f.nome, text, cnab400);
          entries = parsed.entries;
          bankFormat = parsed.format;
        } catch (e) {
          errors.push({ campo: "arquivoBanco", mensagem: e instanceof BankFileError ? e.message : "Não foi possível ler o arquivo do banco." });
        }
      else {
        const r = fromTable("extrato", "arquivoBanco", ctx, errors, flags);
        if (r) {
          entries = r.entries as BankEntry[];
          bankFormat = r.formato;
          fonteBanco = { ...fonteBanco, cabecalho: r.cabecalho, colunas: r.colunas };
        }
      }
    }
  } else if (!isObj(banco)) errors.push({ campo: "banco", mensagem: "Informe banco.lancamentos ou banco.arquivo." });
  else if ((banco.lancamentos !== undefined) === (banco.arquivo !== undefined))
    errors.push({ campo: "banco", mensagem: "Envie exatamente um: banco.lancamentos ou banco.arquivo." });
  else if (banco.lancamentos !== undefined) {
    const l = banco.lancamentos;
    bankFileName = "lancamentos.json";
    bankFormat = "JSON";
    if (Array.isArray(l)) fonteBanco = { sha256: sha256Hex(jsonCanonico(l)) };
    if (!Array.isArray(l) || l.length === 0) errors.push({ campo: "banco.lancamentos", mensagem: "Envie ao menos um lançamento." });
    else if (l.length > API_LIMITS.lancamentos) errors.push({ campo: "banco.lancamentos", mensagem: `No máximo ${API_LIMITS.lancamentos} lançamentos.` });
    else
      l.forEach((r, i) => {
        const at = `banco.lancamentos[${i}]`;
        if (errors.length >= 50) return;
        if (!isObj(r)) return void errors.push({ campo: at, mensagem: "Deve ser um objeto." });
        if (!validAmount(r.valor)) errors.push({ campo: `${at}.valor`, mensagem: "Número positivo em reais, com até 2 casas decimais." });
        const paidAt = parseIsoDay(r.data);
        if (!paidAt) errors.push({ campo: `${at}.data`, mensagem: "Data no formato AAAA-MM-DD." });
        entries.push({ reference: refOf(r.referencia, `${at}.referencia`, errors), amount: r.valor as number, paidAt: paidAt ?? undefined, origem: { linha: i, bruto: JSON.stringify(r).slice(0, 1000) } });
      });
  } else {
    const a = banco.arquivo;
    if (!isObj(a)) errors.push({ campo: "banco.arquivo", mensagem: "Deve ser um objeto { nome, conteudoBase64 }." });
    else {
      bankFileName = str(a.nome, 200).replace(/[^\w.\- ()À-ú]/g, "_").slice(0, 120);
      if (!bankFileName) errors.push({ campo: "banco.arquivo.nome", mensagem: "Informe o nome do arquivo (ex.: retorno.ret)." });
      const b64 = a.conteudoBase64;
      if (typeof b64 !== "string" || !b64 || !/^[A-Za-z0-9+/\r\n]+={0,2}\s*$/.test(b64))
        errors.push({ campo: "banco.arquivo.conteudoBase64", mensagem: "Conteúdo em base64 obrigatório." });
      else {
        const buf = Buffer.from(b64, "base64");
        if (buf.length > API_LIMITS.arquivoBytes) errors.push({ campo: "banco.arquivo.conteudoBase64", mensagem: `Arquivo acima de ${formatBytes(API_LIMITS.arquivoBytes)}.` });
        else if (buf.includes(0)) errors.push({ campo: "banco.arquivo.conteudoBase64", mensagem: "O arquivo não parece ser texto (OFX, CNAB ou CSV)." });
        else if (bankFileName)
          try {
            const text = decodeText(buf);
            const parsed = parseBankFile(bankFileName, text, cnab400);
            entries = parsed.entries;
            bankFormat = parsed.format;
            fonteBanco = { sha256: sha256Hex(buf), cabecalho: parsed.format === "CSV" ? csvHeader(text) : undefined };
          } catch (e) {
            errors.push({ campo: "banco.arquivo", mensagem: e instanceof BankFileError ? e.message : "Não foi possível ler o arquivo do banco." });
          }
      }
    }
  }

  // Opções
  const op = body.opcoes ?? {};
  let options: ReconcileOptions = { toleranciaCentavos: 0, casarPorValorData: false, toleranciaDias: 0 };
  if (!isObj(op)) errors.push({ campo: "opcoes", mensagem: "Deve ser um objeto." });
  else {
    if (op.valorEData !== undefined && typeof op.valorEData !== "boolean") errors.push({ campo: "opcoes.valorEData", mensagem: "Deve ser true ou false." });
    options = {
      toleranciaCentavos: intRange(op.toleranciaCentavos, 100, "opcoes.toleranciaCentavos", errors),
      casarPorValorData: op.valorEData === true,
      toleranciaDias: intRange(op.toleranciaDias, 10, "opcoes.toleranciaDias", errors),
    };
  }

  if (errors.length) return { ok: false, errors: errors.slice(0, 50), ...(flags.semLayout ? { status: 422 as const } : {}) };
  const fontes = { esperados: { arquivo: expectedFileName, ...fonteEsp }, banco: { arquivo: bankFileName, formato: bankFormat, ...fonteBanco } };
  return { ok: true, value: { name, expected, expectedFileName, bankFileName, bankFormat, entries, options, fontes } };
}
