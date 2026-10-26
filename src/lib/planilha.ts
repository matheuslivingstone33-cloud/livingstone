// Leitura de planilhas (CSV em qualquer separador e .xlsx) como grade de textos. Puro: sem banco nem Next.
// A biblioteca de .xlsx é carregada sob demanda (import dinâmico), só no servidor.
import { BankFileError } from "./reconcile";

export type Separador = ";" | "," | "\t" | "|";
export const SEPARADORES: Separador[] = [";", ",", "\t", "|"];

/** Grade de células em texto. `numeros[i]` é o número da linha no arquivo (1-based) de `linhas[i]`. */
export type RawTable = { formato: "CSV" | "XLSX"; separador?: Separador; linhas: string[][]; numeros: number[] };

export const PLANILHA_LIMITES = { linhas: 20_000, colunas: 50, descompactadoBytes: 50 * 1024 * 1024, entradasZip: 2_000 } as const;

/** CSV RFC 4180: aspas, "" escapado, quebra de linha dentro de aspas, BOM. Separador detectado se omitido. */
export function parseCsvTable(text: string, sep?: Separador): { separador: Separador; linhas: string[][]; numeros: number[] } {
  const t = text.replace(/^﻿/, "");
  const s = sep ?? detectSeparator(t);
  const linhas: string[][] = [];
  const numeros: number[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === "\n") line++;
        cell += c;
      }
      continue;
    }
    if (c === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (c === s) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell.trim());
      linhas.push(row);
      numeros.push(start);
      row = [];
      cell = "";
      line++;
      start = line;
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell.trim());
    linhas.push(row);
    numeros.push(start);
  }
  return { separador: s, linhas, numeros };
}

/** Separador mais consistente nas 10 primeiras linhas não vazias (mesma quantidade de colunas, maior que 1). */
export function detectSeparator(text: string): Separador {
  const sample = text.replace(/^﻿/, "").slice(0, 64 * 1024);
  let best: { sep: Separador; freq: number; cols: number } = { sep: ";", freq: 0, cols: 0 };
  for (const sep of SEPARADORES) {
    const { linhas } = parseCsvTable(sample, sep);
    const counts = linhas.filter((l) => l.some((c) => c !== "")).slice(0, 10).map((l) => l.length);
    const freq = new Map<number, number>();
    for (const n of counts) if (n > 1) freq.set(n, (freq.get(n) ?? 0) + 1);
    for (const [cols, f] of freq) if (f > best.freq || (f === best.freq && cols > best.cols)) best = { sep, freq: f, cols };
  }
  return best.sep;
}

const NUMERICO = /^[-+R$\s\d.,/:]*$/;

/** Primeira linha (das 10 primeiras) com ao menos 2 células preenchidas e não numéricas; 0 se nenhuma. */
export function findHeaderLine(linhas: string[][]): number {
  for (let i = 0; i < Math.min(10, linhas.length); i++) {
    const textuais = linhas[i].filter((c) => c.trim() && !NUMERICO.test(c.trim()));
    if (textuais.length >= 2) return i;
  }
  return 0;
}

const isZip = (b: Buffer) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOle = (b: Buffer) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));

export const XLSX_PROTEGIDA = "A planilha está protegida por senha ou no formato antigo .xls. Remova a senha e salve como .xlsx.";

/**
 * Confere o diretório central do ZIP antes de descompactar: soma do tamanho descompactado declarado,
 * quantidade de entradas, ZIP64 e macros. Lança BankFileError se algo passar dos limites.
 */
export function checkZipDirectory(buf: Buffer) {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new BankFileError("Planilha .xlsx corrompida (fim do ZIP não encontrado).");
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOff = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdOff === 0xffffffff || cdOff + cdSize > buf.length) throw new BankFileError("Planilha .xlsx em formato não suportado (ZIP64 ou corrompida).");
  if (total > PLANILHA_LIMITES.entradasZip) throw new BankFileError("Planilha .xlsx com partes internas demais.");
  let p = cdOff;
  let soma = 0;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new BankFileError("Planilha .xlsx corrompida (diretório do ZIP).");
    const flags = buf.readUInt16LE(p + 8);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (flags & 0x1) throw new BankFileError(XLSX_PROTEGIDA);
    if (size === 0xffffffff) throw new BankFileError("Planilha .xlsx em formato não suportado (ZIP64).");
    if (/vbaProject\.bin$/i.test(name)) throw new BankFileError("Planilhas com macros não são aceitas. Salve como .xlsx comum.");
    soma += size;
    if (soma > PLANILHA_LIMITES.descompactadoBytes) throw new BankFileError("Planilha .xlsx grande demais depois de descompactada (limite de 50 MB).");
    p += 46 + nameLen + extra + comment;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Valor de célula da planilha → texto. Número com ponto (até 2 casas), data aaaa-mm-dd (UTC), booleano/fórmula sem valor → "". */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "boolean") return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    const c = v * 100;
    // Ruído de ponto flutuante (0,1 + 0,2) é arredondado; mais de 2 casas de verdade ficam como estão (o valor será recusado)
    if (Math.abs(Math.round(c) - c) <= 1e-6 * Math.max(1, Math.abs(c))) return String(Math.round(c) / 100);
    return String(v);
  }
  return "";
}

function limitar(linhas: string[][]): string[][] {
  // Remove linhas e colunas vazias no fim
  let fim = linhas.length;
  while (fim > 0 && linhas[fim - 1].every((c) => !c)) fim--;
  const out = linhas.slice(0, fim);
  if (out.length > PLANILHA_LIMITES.linhas + 10) throw new BankFileError(`A planilha tem mais de ${PLANILHA_LIMITES.linhas} linhas. Divida em arquivos menores.`);
  let cols = 0;
  for (const l of out) for (let i = l.length; i > cols; i--) if (l[i - 1]) cols = i;
  if (cols > PLANILHA_LIMITES.colunas) throw new BankFileError(`A planilha tem mais de ${PLANILHA_LIMITES.colunas} colunas.`);
  return out.map((l) => l.slice(0, cols));
}

/** Primeira aba de um .xlsx como grade de textos. Só ZIP (PK\x03\x04); confere o ZIP antes de abrir. */
export async function readXlsx(buf: Buffer): Promise<RawTable> {
  if (isOle(buf)) throw new BankFileError(XLSX_PROTEGIDA);
  if (!isZip(buf)) throw new BankFileError("O arquivo não é uma planilha .xlsx válida.");
  checkZipDirectory(buf);
  const { readSheet } = await import("read-excel-file/node");
  let data: unknown[][];
  try {
    data = (await readSheet(buf)) as unknown[][];
  } catch {
    throw new BankFileError("Não foi possível ler a planilha .xlsx. Confira se é uma planilha do Excel salva como .xlsx.");
  }
  const linhas = limitar(data.map((r) => r.map(cellText)));
  return { formato: "XLSX", linhas, numeros: linhas.map((_, i) => i + 1) };
}

/** Arquivo enviado (CSV/TXT ou .xlsx) → grade. .xls e .xlsm são recusados. */
export async function readTable(name: string, buf: Buffer): Promise<RawTable> {
  if (/\.(xls|xlsm|xlsb)$/i.test(name)) throw new BankFileError("Formato não aceito. Salve a planilha como .xlsx (sem macros) ou CSV.");
  if (isZip(buf) || isOle(buf)) {
    if (!/\.xlsx$/i.test(name)) throw new BankFileError("Arquivo compactado não aceito. Envie CSV ou planilha .xlsx.");
    return readXlsx(buf);
  }
  if (buf.includes(0)) throw new BankFileError("O arquivo não parece ser texto nem planilha .xlsx.");
  const utf8 = buf.toString("utf8");
  const text = utf8.includes("�") ? buf.toString("latin1") : utf8;
  const t = parseCsvTable(text);
  const keep = t.linhas.map((l, i) => ({ l, n: t.numeros[i] }));
  const linhas = limitar(keep.map((k) => k.l));
  return { formato: "CSV", separador: t.separador, linhas, numeros: keep.slice(0, linhas.length).map((k) => k.n) };
}
