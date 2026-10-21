// Limites de upload (sem imports: usado no servidor e no navegador).
// A Vercel recusa corpos de função acima de ~4,5 MB (413) antes de chegar ao Next; 4 MB deixa folga para o resto do formulário.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Soma de todos os arquivos de um mesmo envio. */
export const MAX_UPLOAD_TOTAL_BYTES = 4 * 1024 * 1024;

/** Tamanho em MB com uma casa e vírgula decimal (4194304 → "4,0 MB"). */
export function formatBytes(n: number): string {
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function uploadSizeError(name: string, size: number, limit = MAX_UPLOAD_BYTES): string {
  return `O arquivo "${name}" tem ${formatBytes(size)}; o limite é ${formatBytes(limit)}. Divida o período em arquivos menores.`;
}

/** Confere cada arquivo e depois a soma. Devolve a mensagem de erro ou null. */
export function checkUploadSizes(files: { name: string; size: number }[]): string | null {
  for (const f of files) if (f.size > MAX_UPLOAD_BYTES) return uploadSizeError(f.name, f.size);
  const total = files.reduce((a, f) => a + f.size, 0);
  if (total > MAX_UPLOAD_TOTAL_BYTES)
    return `Os arquivos somam ${formatBytes(total)}; o limite por envio é ${formatBytes(MAX_UPLOAD_TOTAL_BYTES)}. Divida o período em arquivos menores.`;
  return null;
}
