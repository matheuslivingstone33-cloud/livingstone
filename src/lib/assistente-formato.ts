// Formatação do texto do assistente para a tela. Puro: recebe texto puro e devolve blocos; nunca interpreta HTML/markdown.

export type LinhaExtrato = { rotulo: string; valor: string };
export type Bloco = { tipo: "texto"; texto: string } | { tipo: "extrato"; linhas: LinhaExtrato[] };

// "Rótulo: R$ 1.234,56" | "Rótulo: 12" | "Rótulo: 3,5%" | "Rótulo: US$ 0,42". O valor precisa ser só o número.
const LINHA = /^\s*(?:[-•]\s+)?([^:\n]{2,48}?)\s*:\s*((?:R\$|US\$)\s?-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|-?\d+(?:\.\d{3})*(?:,\d+)?\s?%?)\s*$/;

/** Linha "Rótulo: valor" com valor numérico, ou null. */
export function linhaExtrato(linha: string): LinhaExtrato | null {
  const m = LINHA.exec(linha);
  if (!m) return null;
  const rotulo = m[1].trim();
  if (!/[A-Za-zÀ-ÿ]/.test(rotulo) || /https?$/i.test(rotulo)) return null;
  return { rotulo, valor: m[2].replace(/\s+/g, " ").replace(/^(R\$|US\$)(?=\S)/, "$1 ") };
}

/** Separa o texto em blocos de texto e de extrato (linhas consecutivas "Rótulo: valor"). */
export function blocosDoTexto(texto: string): Bloco[] {
  const out: Bloco[] = [];
  for (const l of String(texto ?? "").split(/\r?\n/)) {
    const e = linhaExtrato(l);
    const ult = out[out.length - 1];
    if (e) {
      if (ult?.tipo === "extrato") ult.linhas.push(e);
      else out.push({ tipo: "extrato", linhas: [e] });
    } else if (ult?.tipo === "texto") ult.texto += `\n${l}`;
    else out.push({ tipo: "texto", texto: l });
  }
  return out
    .map((b) => (b.tipo === "texto" ? { ...b, texto: b.texto.replace(/^\n+|\n+$/g, "") } : b))
    .filter((b) => b.tipo === "extrato" || b.texto.trim() !== "");
}

/** Protocolo legível a partir do id do plano: LIV-XXXX-XXXX (últimos 8 caracteres alfanuméricos). */
export function protocoloDe(id: string): string {
  const c = String(id ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(-8).padStart(8, "0");
  return `LIV-${c.slice(0, 4)}-${c.slice(4)}`;
}
