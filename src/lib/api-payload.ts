// Validação do corpo JSON da API de conciliação e conversão para os tipos de reconcile.ts. Puro: sem banco nem Next.
import { BankFileError, parseBankFile, type BankEntry, type Cnab400Layout, type ExpectedEntry, type ReconcileOptions } from "./reconcile";
import { decodeText } from "./upload";
import { formatBytes } from "./upload-limits";

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
};

type Result = { ok: true; value: ReconciliationInput } | { ok: false; errors: FieldError[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Data estrita AAAA-MM-DD (rejeita 2026-02-30) */
export function parseIsoDay(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
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

export function validateReconciliationBody(body: unknown, cnab400?: Cnab400Layout): Result {
  const errors: FieldError[] = [];
  if (!isObj(body)) return { ok: false, errors: [{ campo: "", mensagem: "O corpo deve ser um objeto JSON." }] };

  const name = str(body.nome, 120);
  if (!name) errors.push({ campo: "nome", mensagem: "Informe o nome da conciliação." });

  // Esperados
  const expected: ExpectedEntry[] = [];
  const esp = body.esperados;
  if (!Array.isArray(esp) || esp.length === 0) errors.push({ campo: "esperados", mensagem: "Envie ao menos um título esperado." });
  else if (esp.length > API_LIMITS.esperados) errors.push({ campo: "esperados", mensagem: `No máximo ${API_LIMITS.esperados} títulos por conciliação.` });
  else
    esp.forEach((e, i) => {
      const at = `esperados[${i}]`;
      if (errors.length >= 50) return;
      if (!isObj(e)) return void errors.push({ campo: at, mensagem: "Deve ser um objeto." });
      const reference = str(e.referencia, 60);
      if (!reference) errors.push({ campo: `${at}.referencia`, mensagem: "Obrigatória." });
      if (!validAmount(e.valor)) errors.push({ campo: `${at}.valor`, mensagem: "Número positivo em reais, com até 2 casas decimais." });
      const dueAt = parseIsoDay(e.vencimento);
      if (!dueAt) errors.push({ campo: `${at}.vencimento`, mensagem: "Data no formato AAAA-MM-DD." });
      if (e.pagador !== undefined && e.pagador !== null && typeof e.pagador !== "string") errors.push({ campo: `${at}.pagador`, mensagem: "Deve ser texto." });
      expected.push({ reference, payer: str(e.pagador, 120) || undefined, amount: e.valor as number, dueAt: dueAt ?? undefined });
    });

  // Banco: exatamente um de lancamentos / arquivo
  let entries: BankEntry[] = [];
  let bankFileName = "";
  let bankFormat = "";
  const banco = body.banco;
  if (!isObj(banco)) errors.push({ campo: "banco", mensagem: "Informe banco.lancamentos ou banco.arquivo." });
  else if ((banco.lancamentos !== undefined) === (banco.arquivo !== undefined))
    errors.push({ campo: "banco", mensagem: "Envie exatamente um: banco.lancamentos ou banco.arquivo." });
  else if (banco.lancamentos !== undefined) {
    const l = banco.lancamentos;
    bankFileName = "lancamentos.json";
    bankFormat = "JSON";
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
        entries.push({ reference: str(r.referencia, 60), amount: r.valor as number, paidAt: paidAt ?? undefined });
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
            const parsed = parseBankFile(bankFileName, decodeText(buf), cnab400);
            entries = parsed.entries;
            bankFormat = parsed.format;
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

  if (errors.length) return { ok: false, errors: errors.slice(0, 50) };
  return { ok: true, value: { name, expected, expectedFileName: "api.json", bankFileName, bankFormat, entries, options } };
}
