// Biblioteca de documentos: preparo do anexo do assistente, assinatura, validação do registro e resumos.
// Puro: sem banco, sem sessão, sem Next e sem rede. O anexo vai para a IA só como dado não confiável.
import { createHash } from "node:crypto";
import { ASSISTENTE, reserveCost } from "./ai-config";
import type { AiFile, MsgBlock } from "./ai";
import { untrusted } from "./ai-prompt";
import { headerOf, maskCell, normHeader } from "./layout-conciliacao";
import { mascararDocs } from "./mascara";
import { findHeaderLine, parseCsvTable, readXlsx } from "./planilha";
import { decodeText, tipoPorBytes } from "./upload";

export type FormatoDoc = "PLANILHA" | "PDF" | "IMAGEM";
export const FORMATOS_DOC: FormatoDoc[] = ["PLANILHA", "PDF", "IMAGEM"];
export const ROTULO_FORMATO: Record<FormatoDoc, string> = { PLANILHA: "Planilha", PDF: "PDF", IMAGEM: "Imagem" };

export const BIBLIOTECA_LIMITES = {
  paginasPdf: 10,
  linhasAmostra: 5,
  colunas: 50,
  celula: 60,
  titulo: 80,
  explicacao: 600,
  tipo: 60,
  colunaNome: 80,
  colunaSignificado: 200,
  frequencia: 80,
  uso: 300,
  resumosContexto: 30,
  tokensPorPagina: 3000,
  tokensPorImagem: 1600,
  // Valor curto que se repete na amostra fica em claro (ex.: PIX, D/C)
  claroMax: 12,
  claroRepeticoes: 3,
  rascunhoMs: 24 * 60 * 60_000,
} as const;

export const AVISO_PRIVACIDADE = "PDF e imagem são lidos inteiros pela IA; evite documentos com dados pessoais desnecessários.";

export class AnexoError extends Error {}

/** Impressão digital do cabeçalho de uma planilha (mesmas colunas, na mesma ordem), independente do separador. */
export const assinaturaDocumento = (header: string[]) => createHash("sha256").update(`doc\n${header.map(normHeader).join("|")}`).digest("hex");

/** Chave de PDF/imagem: formato + tipo descrito pela IA, normalizado. */
export const chaveTipo = (formato: FormatoDoc, tipo: string) => `tipo:${formato}:${normHeader(String(tipo ?? "")).slice(0, BIBLIOTECA_LIMITES.tipo) || "documento"}`;

/** Chave do rascunho quando a chave base já está em uso por outro registro. */
export const chaveRascunho = (chave: string, userId: string) => `${chave}:r:${userId}`;
/** Chave base de um rascunho (sem o sufixo ":r:userId"). */
export const chaveBase = (chave: string) => chave.split(":r:")[0];

/** Páginas de um PDF pela estrutura (objetos /Type /Page). 0 = não deu para contar (ex.: objetos compactados). */
export function contarPaginasPdf(buf: Buffer): number {
  const s = buf.toString("latin1");
  const n = s.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  if (n) return n;
  const counts = [...s.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return counts.length ? Math.max(...counts) : 0;
}

export type Anexo = {
  formato: FormatoDoc;
  nome: string;
  /** Blocos que entram na mensagem do usuário (document, image ou texto em dados não confiáveis). */
  blocos: MsgBlock[];
  cabecalho?: string[];
  assinatura?: string;
  paginas?: number;
};

const nomeLimpo = (n: string) => String(n ?? "").replace(/[<>"\n\r]/g, "").slice(0, 120);
const DIGITO = /\d/;
// "Ana Paula", "Maria Souza": palavras com inicial maiúscula
const CARA_DE_NOME = /^\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)+$/u;

/** Amostra de até 5 linhas: CPF/CNPJ mascarados e dígitos/letras trocados; só valores curtos repetidos, sem dígitos e sem cara de nome, ficam em claro. */
export function amostraSegura(linhas: string[][], linhaCabecalho: number): { cabecalho: string[]; linhas: string[][] } {
  const L = BIBLIOTECA_LIMITES;
  const cabecalho = headerOf(linhas, linhaCabecalho)
    .slice(0, L.colunas)
    .map((h) => {
      const m = mascararDocs(h);
      return (m !== h ? maskCell(m) : h).slice(0, L.celula);
    });
  const dados = linhas
    .slice(linhaCabecalho + 1)
    .filter((r) => r.some((c) => c.trim()))
    .slice(0, L.linhasAmostra)
    .map((r) => r.slice(0, L.colunas).map((c) => c.trim().slice(0, L.celula)));
  const vezes = new Map<string, number>();
  for (const r of dados) for (const c of r) if (c) vezes.set(c, (vezes.get(c) ?? 0) + 1);
  const claro = (c: string) => c.length <= L.claroMax && (vezes.get(c) ?? 0) >= L.claroRepeticoes && !DIGITO.test(c) && !CARA_DE_NOME.test(c);
  return { cabecalho, linhas: dados.map((r) => r.map((c) => (!c || claro(c) ? c : maskCell(mascararDocs(c))))) };
}

/**
 * Arquivo validado → anexo para a IA. Tipo conferido pelos bytes. CSV/XLSX viram cabeçalho + amostra mascarada;
 * PDF (até 10 páginas) e imagem (PNG, JPEG, WebP) vão inteiros como bloco document/image.
 * `paginas` (contadas fora, pelo leitor de PDF) substitui a contagem estrutural.
 */
export async function prepararAnexo(f: AiFile, opts: { paginas?: number } = {}): Promise<Anexo> {
  const nome = nomeLimpo(f.name);
  const t = tipoPorBytes(f.data, f.name);
  if (!t) throw new AnexoError(`O arquivo "${nome}" não é de um tipo aceito. Envie CSV, XLSX, PDF, PNG, JPG ou WebP.`);
  const rotulo = untrusted("documento_anexado", `Arquivo: ${nome}`);

  if (t.kind === "text" || t.kind === "xlsx") {
    if (t.kind === "text" && !/\.csv$/i.test(f.name)) throw new AnexoError(`O arquivo "${nome}" não é de um tipo aceito. Envie CSV, XLSX, PDF, PNG, JPG ou WebP.`);
    let linhas: string[][];
    try {
      linhas = t.kind === "xlsx" ? (await readXlsx(f.data)).linhas : parseCsvTable(decodeText(f.data)).linhas;
    } catch (e) {
      throw new AnexoError((e as Error)?.message || "Não foi possível ler a planilha.");
    }
    if (!linhas.length) throw new AnexoError(`A planilha "${nome}" está vazia.`);
    const lc = findHeaderLine(linhas);
    const header = headerOf(linhas, lc).slice(0, BIBLIOTECA_LIMITES.colunas);
    const amostra = amostraSegura(linhas, lc);
    const texto = untrusted("planilha_anexada", JSON.stringify({ arquivo: nome, cabecalho: amostra.cabecalho, amostra_mascarada: amostra.linhas }), 20_000);
    return { formato: "PLANILHA", nome, blocos: [{ type: "text", text: texto }], cabecalho: amostra.cabecalho, assinatura: assinaturaDocumento(header) };
  }

  if (t.kind === "pdf") {
    const s = f.data.toString("latin1");
    if (/\/Encrypt\b/.test(s)) throw new AnexoError(`O PDF "${nome}" está protegido por senha. Remova a senha e envie de novo.`);
    if (!s.includes("%%EOF")) throw new AnexoError(`O PDF "${nome}" parece corrompido. Gere o arquivo de novo e envie.`);
    const paginas = opts.paginas ?? contarPaginasPdf(f.data);
    if (paginas > BIBLIOTECA_LIMITES.paginasPdf) throw new AnexoError(`O PDF "${nome}" tem ${paginas} páginas. O limite é ${BIBLIOTECA_LIMITES.paginasPdf}; envie só as páginas que explicam o documento.`);
    return {
      formato: "PDF",
      nome,
      paginas: paginas || BIBLIOTECA_LIMITES.paginasPdf,
      blocos: [{ type: "text", text: rotulo }, { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data.toString("base64") }, title: nome.slice(0, 200) }],
    };
  }

  if (!["image/png", "image/jpeg", "image/webp"].includes(t.mime)) throw new AnexoError(`O arquivo "${nome}" não é de um tipo aceito. Envie CSV, XLSX, PDF, PNG, JPG ou WebP.`);
  return { formato: "IMAGEM", nome, blocos: [{ type: "text", text: rotulo }, { type: "image", source: { type: "base64", media_type: t.mime, data: f.data.toString("base64") } }] };
}

/** Tokens de entrada estimados do anexo (por chamada). */
export function estimarTokensAnexo(a: Pick<Anexo, "formato" | "blocos" | "paginas">): number {
  if (a.formato === "PDF") return (a.paginas || BIBLIOTECA_LIMITES.paginasPdf) * BIBLIOTECA_LIMITES.tokensPorPagina;
  if (a.formato === "IMAGEM") return BIBLIOTECA_LIMITES.tokensPorImagem;
  const chars = a.blocos.reduce((n, b) => n + (typeof b.text === "string" ? b.text.length : 0), 0);
  return Math.ceil(chars / 3);
}

/** Custo estimado (USD) de uma chamada do assistente com o anexo: reserva base + entrada do anexo. */
export function custoEstimadoAnexo(tokens: number, promptChars = 0, env: Record<string, string | undefined> = process.env): number {
  return reserveCost("assistente", Math.max(0, promptChars) + Math.max(0, tokens) * 3, env);
}

/** Pré-checagem antes de chamar a IA: o primeiro passo já não pode passar do teto por mensagem. */
export const anexoCabeNoTeto = (tokens: number, promptChars = 0, env: Record<string, string | undefined> = process.env, teto: number = ASSISTENTE.custoMaxUsdPorMensagem) =>
  custoEstimadoAnexo(tokens, promptChars, env) <= teto;


export type ColunaDoc = { nome: string; significado: string };
export type DocumentoValidado = { titulo: string; explicacao: string; tipo: string; colunas: ColunaDoc[]; frequencia?: string; uso?: string };

const livre = (v: unknown, max: number) => mascararDocs(String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim()).slice(0, max);

/** Lê `colunas` (string JSON ou lista) → [{nome, significado}]. Aceita também objeto {nome: significado}. */
function lerColunas(raw: unknown): { nome: string; significado: string }[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (v && typeof v === "object" && !Array.isArray(v)) v = Object.entries(v as Record<string, unknown>).map(([nome, significado]) => ({ nome, significado }));
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({ nome: String(c.nome ?? c.coluna ?? "").trim(), significado: String(c.significado ?? c.descricao ?? "") }));
}

/**
 * Registro do documento vindo da IA (ou da edição na tela) → versão segura: textos cortados e com CPF/CNPJ
 * mascarados; colunas só as que existem no cabeçalho (planilha), sem repetir, até 50.
 */
export function validarDocumento(v: Record<string, unknown>, cabecalho?: string[] | null): { ok: true; doc: DocumentoValidado } | { ok: false; erro: string } {
  const L = BIBLIOTECA_LIMITES;
  const titulo = livre(v.titulo, L.titulo);
  const explicacao = livre(v.explicacao, L.explicacao);
  const tipo = livre(v.tipo, L.tipo) || titulo;
  if (titulo.length < 3) return { ok: false, erro: "título inválido" };
  if (!explicacao) return { ok: false, erro: "explicação obrigatória" };
  const porNorm = cabecalho?.length ? new Map(cabecalho.map((h) => [normHeader(h), h])) : null;
  const vistos = new Set<string>();
  const colunas: ColunaDoc[] = [];
  for (const c of lerColunas(v.colunas)) {
    const k = normHeader(c.nome);
    if (!k || vistos.has(k)) continue;
    const nome = porNorm ? porNorm.get(k) : livre(c.nome, L.colunaNome);
    if (!nome) continue;
    vistos.add(k);
    colunas.push({ nome: nome.slice(0, L.colunaNome), significado: livre(c.significado, L.colunaSignificado) });
    if (colunas.length >= L.colunas) break;
  }
  const frequencia = livre(v.frequencia, L.frequencia) || undefined;
  const uso = livre(v.uso, L.uso) || undefined;
  return { ok: true, doc: { titulo, explicacao, tipo, colunas, ...(frequencia ? { frequencia } : {}), ...(uso ? { uso } : {}) } };
}

/** Colunas salvas no banco → lista segura (tolera lixo). */
export const colunasSalvas = (raw: unknown): ColunaDoc[] =>
  lerColunas(raw)
    .filter((c) => c.nome)
    .slice(0, BIBLIOTECA_LIMITES.colunas)
    .map((c) => ({ nome: c.nome.slice(0, BIBLIOTECA_LIMITES.colunaNome), significado: c.significado.slice(0, BIBLIOTECA_LIMITES.colunaSignificado) }));

export type ResumoDoc = { titulo: string; formato: string; explicacao: string; colunas?: unknown; uso?: string | null; frequencia?: string | null };

/** Resumos de documentos confirmados para o contexto da IA (até 30, curtos), já envoltos em dados não confiáveis. */
export function resumoParaContexto(docs: ResumoDoc[], tipo = "biblioteca_documentos"): string {
  const itens = docs.slice(0, BIBLIOTECA_LIMITES.resumosContexto).map((d) => ({
    titulo: d.titulo.slice(0, 80),
    formato: d.formato,
    explicacao: d.explicacao.slice(0, 300),
    colunas: colunasSalvas(d.colunas ?? [])
      .slice(0, 20)
      .map((c) => `${c.nome}: ${c.significado.slice(0, 80)}`),
    ...(d.frequencia ? { frequencia: d.frequencia.slice(0, 80) } : {}),
    ...(d.uso ? { uso: d.uso.slice(0, 160) } : {}),
  }));
  return untrusted(tipo, JSON.stringify(itens), 20_000);
}

/** Significado das colunas confirmado na biblioteca → dicas para o mapeamento (só colunas do cabeçalho). */
export function dicasDeColunas(colunas: unknown, header: string[]): string[] {
  const existe = new Set(header.map(normHeader));
  return colunasSalvas(colunas)
    .filter((c) => existe.has(normHeader(c.nome)) && c.significado.trim())
    .map((c) => `${c.nome}: ${mascararDocs(c.significado)}`.slice(0, 260));
}
