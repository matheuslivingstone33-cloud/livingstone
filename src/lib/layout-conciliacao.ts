// Layout de colunas de uma planilha de conciliação (esperados ou extrato): sugestão, validação e conversão.
// Puro: sem banco nem Next. A planilha chega como grade de textos (ver planilha.ts).
import { createHash } from "node:crypto";
import { BankFileError, REF_MAX, fileErrors, parseMoney, utcDay, validMoney, type BankEntry, type ExpectedEntry } from "./reconcile";

export type TipoLayout = "esperados" | "extrato";
export const FORMATOS_DATA = ["dd/mm/aaaa", "aaaa-mm-dd", "mm/dd/aaaa", "dd-mm-aaaa", "dd.mm.aaaa", "aaaammdd"] as const;
export type FormatoData = (typeof FORMATOS_DATA)[number];
export const FORMATOS_VALOR = ["br", "ponto"] as const;
export type FormatoValor = (typeof FORMATOS_VALOR)[number];
export const CAMPOS = ["referencia", "valor", "data", "pagador", "descricao", "sinal"] as const;
export type Campo = (typeof CAMPOS)[number];
export const SEPARADORES_LAYOUT = [";", ",", "\t", "|"] as const;

export type Layout = {
  tipo: TipoLayout;
  colunas: { referencia: string; valor: string; data?: string; pagador?: string; descricao?: string; sinal?: string };
  formatoData: FormatoData;
  formatoValor: FormatoValor;
  separador?: (typeof SEPARADORES_LAYOUT)[number];
  linhaCabecalho: number;
};

/** Grade de textos (mesma forma de RawTable em planilha.ts). */
export type Tabela = { linhas: string[][]; numeros: number[]; separador?: string };

/** Nome de coluna comparável: minúsculas, sem acento, só letras, dígitos e #. */
export const normHeader = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9#]/g, "");

/** Cabeçalho exibível: vazio vira "Coluna N" e repetido ganha "#2", "#3"... */
export function headerOf(linhas: string[][], linhaCabecalho: number): string[] {
  const raw = linhas[linhaCabecalho] ?? [];
  const seen = new Map<string, number>();
  return raw.map((c, i) => {
    const base = c.trim().slice(0, 80) || `Coluna ${i + 1}`;
    const k = normHeader(base);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n > 1 ? `${base}#${n}` : base;
  });
}

/** Impressão digital do cabeçalho de um tipo de arquivo (mesmas colunas, na mesma ordem). */
export const layoutSignature = (tipo: TipoLayout, header: string[]) =>
  createHash("sha256").update(`${tipo}\n${header.map(normHeader).join("|")}`).digest("hex");

const SINONIMOS: Record<Campo, string[]> = {
  valor: ["valor", "vlr", "valorpago", "valortitulo", "valorrecebido", "credito", "montante", "valoresperado"],
  data: ["data", "dt", "vencimento", "datapagamento", "datacredito", "dtvenc", "datavencimento", "dtpagamento"],
  referencia: ["referencia", "ref", "nossonumero", "documento", "doc", "id", "titulo"],
  pagador: ["pagador", "cliente", "sacado", "nome", "favorecido"],
  descricao: ["descricao", "historico", "memo", "complemento"],
  sinal: ["dc", "cd", "sinal", "natureza", "debitocredito", "creditodebito"],
};

// "Vlr Pago" → "vlrpago" e também "valorpago"
const variants = (h: string) => {
  const n = normHeader(h).replace(/#\d+$/, "");
  return [n, n.replace(/^vlr/, "valor"), n.replace(/^dt/, "data")];
};

/** Lê data no formato dado; aaaa-mm-dd (datas nativas da planilha) também é aceito. undefined = vazio, null = inválida. */
export function parseDateAs(raw: string, fmt: FormatoData): Date | undefined | null {
  const s = raw.trim();
  if (!s) return undefined;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return utcDay(+iso[1], +iso[2], +iso[3]) ?? null;
  const re: Record<FormatoData, [RegExp, [number, number, number]]> = {
    "dd/mm/aaaa": [/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, [3, 2, 1]],
    "aaaa-mm-dd": [/^(\d{4})-(\d{1,2})-(\d{1,2})$/, [1, 2, 3]],
    "mm/dd/aaaa": [/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, [3, 1, 2]],
    "dd-mm-aaaa": [/^(\d{1,2})-(\d{1,2})-(\d{4})$/, [3, 2, 1]],
    "dd.mm.aaaa": [/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, [3, 2, 1]],
    aaaammdd: [/^(\d{4})(\d{2})(\d{2})$/, [1, 2, 3]],
  };
  const [rx, [y, m, d]] = re[fmt];
  const x = s.match(rx);
  if (!x) return null;
  return utcDay(+x[y], +x[m], +x[d]) ?? null;
}

const money = (raw: string, f: FormatoValor) => parseMoney(raw, f === "ponto" ? "ofx" : "br");

export type Sugestao = { layout: Partial<Layout["colunas"]>; formatoData?: FormatoData; formatoValor?: FormatoValor; confianca: "alta" | "baixa"; motivos: string[] };

const dataRows = (t: Tabela, linhaCabecalho: number) => t.linhas.slice(linhaCabecalho + 1).filter((l) => l.some((c) => c.trim()));

/** Formatos de data que leem todos os valores da amostra. */
function dateFormatsFor(values: string[]): FormatoData[] {
  const v = values.filter((x) => x.trim());
  if (!v.length) return [];
  // aaaa-mm-dd é aceito por todos (datas nativas da planilha); só ele, então, é o formato
  if (v.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.trim()))) return v.every((x) => parseDateAs(x, "aaaa-mm-dd")) ? ["aaaa-mm-dd"] : [];
  return FORMATOS_DATA.filter((f) => v.every((x) => parseDateAs(x, f)));
}

/** Sugestão por sinônimos dos nomes de coluna e pela amostra. Alta confiança só sem nenhuma ambiguidade. */
export function guessLayout(tipo: TipoLayout, header: string[], t: Tabela, linhaCabecalho: number): Sugestao {
  const motivos: string[] = [];
  const colunas: Partial<Layout["colunas"]> = {};
  let alta = true;
  const usados = new Set<string>();
  const campos: Campo[] = tipo === "extrato" ? ["referencia", "valor", "data", "pagador", "descricao", "sinal"] : ["referencia", "valor", "data", "pagador"];
  for (const campo of campos) {
    const cands = header.filter((h) => !usados.has(h) && variants(h).some((v) => SINONIMOS[campo].includes(v)));
    if (cands.length === 1) {
      colunas[campo] = cands[0];
      usados.add(cands[0]);
    } else if (cands.length > 1) {
      alta = false;
      motivos.push(`Mais de uma coluna pode ser ${campo}: ${cands.join(", ")}`);
    } else if (campo === "referencia" || campo === "valor") {
      alta = false;
      motivos.push(`Nenhuma coluna reconhecida como ${campo}`);
    }
  }
  const rows = dataRows(t, linhaCabecalho).slice(0, 50);
  const col = (name?: string) => (name ? rows.map((r) => r[header.indexOf(name)] ?? "") : []);
  let formatoData: FormatoData | undefined;
  if (colunas.data) {
    const vals = col(colunas.data).filter((x) => x.trim());
    const fs = dateFormatsFor(vals);
    if (!fs.length) {
      alta = false;
      motivos.push("Formato de data não reconhecido");
    } else if (fs.includes("dd/mm/aaaa") && fs.includes("mm/dd/aaaa")) {
      formatoData = "dd/mm/aaaa";
      // Só é certeza se algum dia passa de 12 na primeira posição
      if (!vals.some((x) => Number(x.split("/")[0]) > 12)) {
        alta = false;
        motivos.push("Data pode ser dia/mês ou mês/dia");
      }
    } else {
      formatoData = fs[0];
      if (fs.length > 1) {
        alta = false;
        motivos.push("Mais de um formato de data possível");
      }
    }
  }
  let formatoValor: FormatoValor | undefined;
  if (colunas.valor) {
    const vals = col(colunas.valor).filter((x) => x.trim());
    const br = vals.map((x) => money(x, "br"));
    const pt = vals.map((x) => money(x, "ponto"));
    const brOk = br.every((n) => n !== null);
    const ptOk = pt.every((n) => n !== null);
    if (brOk && (!ptOk || br.every((n, i) => n === pt[i]))) formatoValor = "br";
    else if (ptOk && !brOk) formatoValor = "ponto";
    else {
      alta = false;
      formatoValor = brOk ? "br" : undefined;
      motivos.push(brOk ? "Valor pode usar ponto ou vírgula como decimal" : "Formato de valor não reconhecido");
    }
  }
  return { layout: colunas, formatoData: formatoData ?? (colunas.data ? undefined : "dd/mm/aaaa"), formatoValor, confianca: alta ? "alta" : "baixa", motivos };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Validação estrita: sem chaves extras, colunas existentes no cabeçalho, enums, referência ≠ valor. */
export function validateLayout(x: unknown, header: string[]): { ok: true; layout: Layout } | { ok: false; erro: string } {
  const bad = (erro: string) => ({ ok: false as const, erro });
  if (!isRec(x) || Object.getPrototypeOf(x) !== Object.prototype && Object.getPrototypeOf(x) !== null) return bad("Layout deve ser um objeto.");
  const keys = Object.keys(x);
  const allowed = ["tipo", "colunas", "formatoData", "formatoValor", "separador", "linhaCabecalho"];
  if (keys.some((k) => !allowed.includes(k)) || own(x, "__proto__")) return bad("Layout com campos desconhecidos.");
  if (x.tipo !== "esperados" && x.tipo !== "extrato") return bad("Tipo de layout inválido.");
  if (!FORMATOS_DATA.includes(x.formatoData as FormatoData)) return bad("Formato de data inválido.");
  if (!FORMATOS_VALOR.includes(x.formatoValor as FormatoValor)) return bad("Formato de valor inválido.");
  if (x.separador !== undefined && !SEPARADORES_LAYOUT.includes(x.separador as ";")) return bad("Separador inválido.");
  if (typeof x.linhaCabecalho !== "number" || !Number.isInteger(x.linhaCabecalho) || x.linhaCabecalho < 0 || x.linhaCabecalho > 10) return bad("Linha do cabeçalho inválida.");
  const c = x.colunas;
  if (!isRec(c)) return bad("Colunas inválidas.");
  const ck = Object.keys(c);
  if (ck.some((k) => !(CAMPOS as readonly string[]).includes(k)) || own(c, "__proto__")) return bad("Colunas com campos desconhecidos.");
  const colunas: Layout["colunas"] = { referencia: "", valor: "" };
  for (const k of CAMPOS) {
    const v = c[k];
    if (v === undefined || v === "") {
      if (k === "referencia" || k === "valor") return bad(`Escolha a coluna de ${k}.`);
      continue;
    }
    if (typeof v !== "string" || !header.includes(v)) return bad(`A coluna de ${k} não existe no arquivo.`);
    if (k === "sinal" && x.tipo !== "extrato") return bad("Coluna de débito/crédito só vale para extrato.");
    colunas[k] = v;
  }
  if (colunas.referencia === colunas.valor) return bad("Referência e valor precisam ser colunas diferentes.");
  const layout: Layout = { tipo: x.tipo, colunas, formatoData: x.formatoData as FormatoData, formatoValor: x.formatoValor as FormatoValor, linhaCabecalho: x.linhaCabecalho };
  if (x.separador !== undefined) layout.separador = x.separador as Layout["separador"];
  return { ok: true, layout };
}

const CPF_CNPJ = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/;
/** Dígito → 9, letra → a; pontuação e comprimento preservados. */
export const maskCell = (s: string) => s.replace(/\d/g, "9").replace(/\p{L}/gu, "a");

/** Amostra para a IA: cabeçalho (≤50 colunas × 60 caracteres) e até `n` linhas mascaradas. */
export function sampleForAi(t: Tabela, linhaCabecalho: number, n = 5): { cabecalho: string[]; linhas: string[][] } {
  const cabecalho = headerOf(t.linhas, linhaCabecalho).slice(0, 50).map((h) => (CPF_CNPJ.test(h) ? maskCell(h) : h).slice(0, 60));
  const linhas = dataRows(t, linhaCabecalho).slice(0, Math.min(5, n)).map((r) => r.slice(0, 50).map((c) => maskCell(c.slice(0, 60))));
  return { cabecalho, linhas };
}

export type LinhaConvertida = { linha: number; referencia: string; valor?: number; data?: string; pagador?: string; ignorada?: string; erro?: string };

function convertRows(t: Tabela, layout: Layout, header: string[], limit = Infinity) {
  const idx = (name?: string) => (name ? header.indexOf(name) : -1);
  const I = { ref: idx(layout.colunas.referencia), val: idx(layout.colunas.valor), data: idx(layout.colunas.data), pag: idx(layout.colunas.pagador), desc: idx(layout.colunas.descricao), sinal: idx(layout.colunas.sinal) };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const out: LinhaConvertida[] = [];
  for (let i = layout.linhaCabecalho + 1; i < t.linhas.length && out.length < limit; i++) {
    const r = t.linhas[i];
    if (!r.some((c) => c.trim())) continue;
    const linha = t.numeros[i] ?? i + 1;
    const referencia = get(r, I.ref);
    const rawV = get(r, I.val);
    const rawD = get(r, I.data);
    const pagador = (get(r, I.pag) || get(r, I.desc)).slice(0, 120) || undefined;
    const item: LinhaConvertida = { linha, referencia, pagador };
    const erros: string[] = [];
    const v = rawV ? money(rawV, layout.formatoValor) : null;
    const d = parseDateAs(rawD, layout.formatoData);
    if (d) item.data = d.toISOString().slice(0, 10);
    if (layout.tipo === "extrato") {
      const s = normHeader(get(r, I.sinal));
      if (!rawV) item.ignorada = "sem valor";
      else if (v === null) erros.push(`valor ${rawV} ilegível`);
      else if (s.startsWith("d") || v <= 0) item.ignorada = "débito";
      else if (s && !s.startsWith("c")) erros.push(`débito/crédito "${get(r, I.sinal).slice(0, 20)}" não reconhecido`);
      else if (!validMoney(v)) erros.push(`valor ${rawV} fora do limite`);
      else item.valor = v;
    } else {
      if (!referencia) erros.push("referência obrigatória");
      if (!rawV) erros.push("valor obrigatório");
      else if (v === null) erros.push(`valor ${rawV} ilegível`);
      else if (!validMoney(v)) erros.push(`valor ${rawV} deve ser positivo`);
      else item.valor = v;
    }
    if (!item.ignorada) {
      if (referencia.length > REF_MAX) erros.push(`referência com mais de ${REF_MAX} caracteres`);
      if (d === null) erros.push(`data ${rawD.slice(0, 20)} inválida`);
    }
    if (erros.length) item.erro = erros.join(", ");
    out.push(item);
  }
  return out;
}

/** Primeiras linhas convertidas, com erro ou motivo de ser ignorada (para a prévia na tela). */
export const previewRows = (t: Tabela, layout: Layout, n = 10) => convertRows(t, layout, headerOf(t.linhas, layout.linhaCabecalho), n);

/** Converte a planilha inteira. Linhas inválidas viram BankFileError com o número da linha. */
export function convertWithLayout(t: Tabela, layout: Layout): ExpectedEntry[] | BankEntry[] {
  const rows = convertRows(t, layout, headerOf(t.linhas, layout.linhaCabecalho));
  const label = layout.tipo === "esperados" ? "de esperados" : "do banco";
  fileErrors(label, rows.filter((r) => r.erro).map((r) => `Linha ${r.linha}: ${r.erro}`));
  const ok = rows.filter((r) => !r.ignorada && r.valor !== undefined);
  if (!ok.length) throw new BankFileError(`Arquivo ${label}: nenhuma linha com valor válido.`);
  const date = (s?: string) => (s ? new Date(`${s}T00:00:00.000Z`) : undefined);
  return layout.tipo === "esperados"
    ? ok.map((r) => ({ reference: r.referencia, payer: r.pagador, amount: r.valor!, dueAt: date(r.data) }))
    : ok.map((r) => ({ reference: r.referencia, payer: r.pagador, amount: r.valor!, paidAt: date(r.data) }));
}

/** Nomes de coluna que mudaram entre dois layouts (para a auditoria). */
export function layoutDiff(a: Layout, b: Layout): string[] {
  const out: string[] = [];
  for (const k of CAMPOS) if ((a.colunas[k] ?? "") !== (b.colunas[k] ?? "")) out.push(`${k}: ${a.colunas[k] ?? "-"} → ${b.colunas[k] ?? "-"}`);
  if (a.formatoData !== b.formatoData) out.push(`data: ${a.formatoData} → ${b.formatoData}`);
  if (a.formatoValor !== b.formatoValor) out.push(`valor: ${a.formatoValor} → ${b.formatoValor}`);
  return out;
}

/** CSV no formato antigo (colunas referencia/valor com os nomes conhecidos) segue o leitor de sempre. */
export function isLegacyCsv(tipo: TipoLayout, text: string): boolean {
  const first = text.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim()) ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const keys = first.split(sep).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, ""));
  const ref = ["referencia", "nossonumero", "documento", "id"].some((k) => keys.includes(k));
  const val = (tipo === "esperados" ? ["valor", "valortitulo", "valoresperado"] : ["valorpago", "valor", "valorrecebido"]).some((k) => keys.includes(k));
  return ref && val && !first.includes('"');
}

/** Prévia devolvida à tela quando um arquivo ainda não tem layout salvo. */
export type PreviaArquivo = {
  tipo: TipoLayout;
  arquivo: string;
  cabecalho: string[];
  colunas: Partial<Layout["colunas"]>;
  formatoData?: FormatoData;
  formatoValor?: FormatoValor;
  confianca: "alta" | "baixa";
  origem: "ia" | "heuristica" | "usuario";
  motivos: string[];
  linhas: LinhaConvertida[];
  erro?: string;
};
export type ResultadoPrevia = { ok: false; erro: string } | { ok: true; previas: PreviaArquivo[] };
