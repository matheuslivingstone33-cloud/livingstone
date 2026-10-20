// CSV para Excel em pt-BR: separador ";", BOM UTF-8, CRLF. Puro.

/** Célula de texto entre aspas. Neutraliza injeção de fórmula: no Excel, células iniciadas por = + - @ tab ou CR viram fórmulas. */
export const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** Número com 2 casas e vírgula decimal; vazio para nulo. */
export const num = (v: unknown) => (v === null || v === undefined ? "" : Number(v).toFixed(2).replace(".", ","));

export const CSV_BOM = "﻿";

/** Monta o documento: cabeçalho + linhas já formatadas, com BOM e CRLF. */
export const csvDocument = (header: string[], lines: string[][]) => CSV_BOM + [header.join(";"), ...lines.map((l) => l.join(";"))].join("\r\n");
