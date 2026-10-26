// Validação de uploads pelo conteúdo real (assinatura do arquivo), não pela extensão ou pelo tipo informado pelo navegador.
import type { AiFile } from "./ai";

import { MAX_UPLOAD_BYTES, checkUploadSizes, uploadSizeError } from "./upload-limits";

// Limites em upload-limits.ts (cabem no corpo máximo de função da Vercel, ~4,5 MB)
export { MAX_UPLOAD_BYTES };
export type UploadKind = "text" | "pdf" | "image" | "xlsx";

export class UploadError extends Error {}

function sniff(buf: Buffer, name = ""): { kind: UploadKind; mime: string } | null {
  // Planilha .xlsx: assinatura ZIP (PK 03 04) e extensão .xlsx; outro ZIP não é aceito
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
    return name.toLowerCase().endsWith(".xlsx") ? { kind: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } : null;
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { kind: "pdf", mime: "application/pdf" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "image", mime: "image/png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return { kind: "image", mime: "image/webp" };
  // Texto: sem bytes nulos nem de controle (exceto tab, quebras de linha e form feed) no início
  const head = buf.subarray(0, 8192);
  for (const b of head) if (b === 0 || (b < 0x20 && ![0x09, 0x0a, 0x0c, 0x0d].includes(b))) return null;
  return { kind: "text", mime: "text/plain" };
}

export async function readUpload(entry: FormDataEntryValue | null, allowed: UploadKind[]): Promise<AiFile | null> {
  if (!(entry instanceof File) || entry.size === 0) return null;
  if (entry.size > MAX_UPLOAD_BYTES) throw new UploadError(uploadSizeError(entry.name, entry.size));
  const data = Buffer.from(await entry.arrayBuffer());
  // Planilha protegida por senha (ou .xls antigo) é um contêiner OLE, não ZIP
  if (allowed.includes("xlsx") && data.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])))
    throw new UploadError(`O arquivo "${entry.name}" está protegido por senha ou no formato antigo .xls. Remova a senha e salve como .xlsx.`);
  const t = sniff(data, entry.name);
  if (!t || !allowed.includes(t.kind))
    throw new UploadError(`O arquivo "${entry.name}" não é de um tipo aceito aqui (${allowed.join(", ")}).`);
  const name = entry.name.replace(/[^\w.\- ()À-ú]/g, "_").slice(0, 120);
  return { name, mime: t.mime, data };
}

/** Confere a soma dos arquivos de um envio (cada um já é conferido em readUpload). */
export function assertUploadTotal(entries: (FormDataEntryValue | null)[]) {
  const files = entries.filter((e): e is File => e instanceof File);
  const err = checkUploadSizes(files.map((f) => ({ name: f.name, size: f.size })));
  if (err) throw new UploadError(err);
}

// CNAB, OFX e CSV de bancos brasileiros costumam vir em Latin-1
export function decodeText(buf: Buffer) {
  const utf8 = buf.toString("utf8");
  return utf8.includes("�") ? buf.toString("latin1") : utf8;
}
