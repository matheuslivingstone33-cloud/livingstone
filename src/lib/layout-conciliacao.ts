// Layout de colunas de uma planilha de conciliação (esperados ou extrato): sugestão, validação e conversão.
// Puro: sem banco nem Next. A planilha chega como grade de textos (ver planilha.ts).
import { createHash } from "node:crypto";
import { BankFileError, REF_MAX, fileErrors, parseMoney, parseMoneyUs, utcDay, validMoney, type BankEntry, type ExpectedEntry } from "./reconcile";
import { FORMATOS_DATA, FORMATOS_VALOR, isMoeda, type FormatoData, type FormatoValor, type Moeda } from "./moeda";

export { FORMATOS_DATA, FORMATOS_VALOR, type FormatoData, type FormatoValor };

export type TipoLayout = "esperados" | "extrato";
export const CAMPOS = ["referencia", "valor", "data", "pagador", "descricao", "sinal", "forma"] as const;
export type Campo = (typeof CAMPOS)[number];
export const SEPARADORES_LAYOUT = [";", ",", "\t", "|"] as const;

export type Layout = {
  tipo: TipoLayout;
  colunas: { referencia: string; valor: string; data?: string; pagador?: string; descricao?: string; sinal?: string; forma?: string };
  formatoData: FormatoData;
  formatoValor: FormatoValor;
  separador?: (typeof SEPARADORES_LAYOUT)[number];
  linhaCabecalho: number;
  /** Moeda da planilha, escolhida pelo usuário. Ausente em layouts antigos: vale BRL. */
  moeda?: Moeda;
};

/** Moeda de um layout salvo; layout antigo (sem moeda) é BRL. */
export const moedaDoLayout = (l: Pick<Layout, "moeda">): Moeda => l.moeda ?? "BRL";

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
  // "credit" e "debit" sozinhos não entram: em extrato em inglês costumam ser colunas separadas de entrada e saída
  valor: ["valor", "vlr", "valorpago", "valortitulo", "valorrecebido", "credito", "montante", "valoresperado", "amount", "value", "total"],
  data: ["data", "dt", "vencimento", "datapagamento", "datacredito", "dtvenc", "datavencimento", "dtpagamento", "date", "duedate", "paymentdate", "posteddate", "transactiondate"],
  referencia: ["referencia", "ref", "nossonumero", "documento", "doc", "id", "titulo", "reference", "invoice", "invoicenumber", "invoiceno"],
  pagador: ["pagador", "cliente", "sacado", "nome", "favorecido", "payer", "customer", "client", "name"],
  descricao: ["descricao", "historico", "memo", "complemento", "description", "details"],
  sinal: ["dc", "cd", "sinal", "natureza", "debitocredito", "creditodebito", "debitcredit", "creditdebit", "drcr", "crdr"],
  // Forma de recebimento (só esperados): usada na pista de taxa de cartão
  forma: ["forma", "formapagamento", "meiopagamento", "tipopagamento", "modalidade", "paymentmethod", "method", "cardtype"],
};

// Coluna "Type": vira sinal só se ≥ 80% dos valores são débito/crédito; vira forma só se parecem formas de pagamento
const DEBITO_CREDITO = new Set(["d", "c", "dr", "cr", "debit", "credit", "debito", "credito"]);
const FORMA_PAGAMENTO = /credit|debit|card|cartao|visa|master|amex|elo|pix|boleto|ach|wire|transfer|check|cheque|cash|dinheiro|paypal|zelle/;
function tipoServeDe(campo: "sinal" | "forma", valores: string[]): boolean {
  const v = valores.map(normHeader).filter(Boolean);
  if (!v.length) return false;
  if (campo === "sinal") return v.filter((x) => DEBITO_CREDITO.has(x)).length / v.length >= 0.8;
  return v.every((x) => FORMA_PAGAMENTO.test(x)) && !v.every((x) => DEBITO_CREDITO.has(x));
}

// "Vlr Pago" → "vlrpago" e também "valorpago"
const variants = (h: string) => {
  const n = normHeader(h).replace(/#\d+$/, "");
  return [n, n.replace(/^vlr/, "valor"), n.replace(/^dt/, "data")];
};

/** Lê data no formato dado; aaaa-mm-dd (datas nativas da planilha) também é aceito. undefined = vazio, null = inválida. */
export function parseDateAs(raw: string, fmt: FormatoData): Date | undefined | null {
  const s = raw.trim();
  if (!s) return undefined;
  // ISO, com ou sem hora ("2026-10-27T15:30:00Z"): vale o dia escrito, sem conversão de fuso
  const iso = s.match(ISO);
  if (iso) return utcDay(+iso[1], +iso[2], +iso[3]) ?? null;
  // Mês por extenso não é ambíguo: os dois formatos com nome de mês leem as duas formas
  if (fmt === "mmm dd, aaaa" || fmt === "dd-mmm-aaaa") return dataComMes(s);
  const re: Record<Exclude<FormatoData, "mmm dd, aaaa" | "dd-mmm-aaaa">, [RegExp, [number, number, number]]> = {
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

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const MESES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
/** "Oct 27, 2026", "October 27 2026", "Oct. 27, 2026", "27-Oct-2026", "27-October-2026" (meses em inglês). */
function dataComMes(s: string): Date | null {
  let m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/);
  if (m) {
    const mes = MESES[m[1].toLowerCase()];
    return mes ? utcDay(+m[3], mes, +m[2]) ?? null : null;
  }
  m = s.match(/^(\d{1,2})-([A-Za-z]{3,9})-(\d{4})$/);
  if (m) {
    const mes = MESES[m[2].toLowerCase()];
    return mes ? utcDay(+m[3], mes, +m[1]) ?? null : null;
  }
  return null;
}

/** Valor em texto no formato do layout → número (null se ilegível). */
export const money = (raw: string, f: FormatoValor) => (f === "us" ? parseMoneyUs(raw) : parseMoney(raw, f === "ponto" ? "ofx" : "br"));

/** Dúvidas que só o usuário resolve: os formatos possíveis, na ordem de FORMATOS_*. */
export type Perguntas = { data?: FormatoData[]; valor?: FormatoValor[] };
export type Sugestao = {
  layout: Partial<Layout["colunas"]>;
  formatoData?: FormatoData;
  formatoValor?: FormatoValor;
  confianca: "alta" | "baixa";
  motivos: string[];
  perguntas?: Perguntas;
};

/**
 * Moeda pelos símbolos do cabeçalho e da amostra (textos originais, não mascarados).
 * USD: "US$", "U$", "USD" ou "$" solto · BRL: "R$" ou "BRL". Sem sinal, ou com sinais das duas, devolve undefined.
 */
export function detectarMoeda(header: string[], amostra: string[][]): Moeda | undefined {
  const textos = [...header, ...amostra.flat()].map((s) => String(s ?? "").toUpperCase());
  const usd = textos.some((s) => /US\$|U\$|\bUSD\b|(^|[^A-Z])\$/.test(s.replace(/R\$/g, "")));
  const brl = textos.some((s) => /R\$|\bBRL\b/.test(s));
  return usd && !brl ? "USD" : brl && !usd ? "BRL" : undefined;
}

const dataRows = (t: Tabela, linhaCabecalho: number) => t.linhas.slice(linhaCabecalho + 1).filter((l) => l.some((c) => c.trim()));

/** Formatos de data que leem todos os valores da amostra. */
function dateFormatsFor(values: string[]): FormatoData[] {
  const v = values.filter((x) => x.trim());
  if (!v.length) return [];
  // aaaa-mm-dd (com ou sem hora) é aceito por todos (datas nativas da planilha); só ele, então, é o formato
  if (v.every((x) => ISO.test(x.trim()))) return v.every((x) => parseDateAs(x, "aaaa-mm-dd")) ? ["aaaa-mm-dd"] : [];
  return FORMATOS_DATA.filter((f) => v.every((x) => parseDateAs(x, f)));
}

const COM_MES: FormatoData[] = ["mmm dd, aaaa", "dd-mmm-aaaa"];
const VENCE_ID = ["reference", "invoice", "invoicenumber", "invoiceno"];

/** Entre várias colunas de data: nos esperados vence a de vencimento (due); no extrato, a de lançamento (posted/transaction). */
function desempateData(tipo: TipoLayout, cands: string[]): string | undefined {
  const pref = cands.filter((h) => {
    const n = normHeader(h);
    return tipo === "esperados" ? n.includes("due") : n.includes("posted") || n.includes("transaction");
  });
  return pref.length === 1 ? pref[0] : undefined;
}

/**
 * Formato de valor da amostra. Um formato só é escolhido se todos os que leem a amostra inteira dão os mesmos números
 * (o primeiro na ordem de FORMATOS_VALOR); se dão números diferentes, vira pergunta. `ler` é injetável para teste.
 */
export function formatoValorDa(vals: string[], ler: (raw: string, f: FormatoValor) => number | null = money): { formato?: FormatoValor; pergunta?: FormatoValor[] } {
  const leitores = FORMATOS_VALOR.filter((f) => vals.every((x) => ler(x, f) !== null));
  if (!leitores.length) return {};
  const lidos = leitores.map((f) => vals.map((x) => ler(x, f)));
  return lidos.every((l) => l.every((n, i) => n === lidos[0][i])) ? { formato: leitores[0] } : { pergunta: [...leitores] };
}

/** Sugestão por sinônimos dos nomes de coluna e pela amostra. Alta confiança só sem nenhuma ambiguidade. */
export function guessLayout(tipo: TipoLayout, header: string[], t: Tabela, linhaCabecalho: number): Sugestao {
  const motivos: string[] = [];
  const colunas: Partial<Layout["colunas"]> = {};
  const perguntas: Perguntas = {};
  let alta = true;
  const usados = new Set<string>();
  const rows = dataRows(t, linhaCabecalho).slice(0, 50);
  const col = (name?: string) => (name ? rows.map((r) => r[header.indexOf(name)] ?? "") : []);
  const campos: Campo[] = tipo === "extrato" ? ["referencia", "valor", "data", "pagador", "descricao", "sinal"] : ["referencia", "valor", "data", "pagador", "forma"];
  for (const campo of campos) {
    let cands = header.filter(
      (h) =>
        !usados.has(h) &&
        (variants(h).some((v) => SINONIMOS[campo].includes(v)) || ((campo === "sinal" || campo === "forma") && variants(h)[0] === "type" && tipoServeDe(campo, col(h)))),
    );
    // "id" perde para invoice/reference (os outros empates de referência continuam sendo dúvida, como antes)
    if (campo === "referencia" && cands.length > 1 && cands.some((h) => VENCE_ID.includes(variants(h)[0]))) cands = cands.filter((h) => variants(h)[0] !== "id");
    if (campo === "data" && cands.length > 1) {
      const d = desempateData(tipo, cands);
      if (d) cands = [d];
    }
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
  let formatoData: FormatoData | undefined;
  if (colunas.data) {
    const vals = col(colunas.data).filter((x) => x.trim());
    const fs = dateFormatsFor(vals);
    if (!fs.length) {
      alta = false;
      motivos.push("Formato de data não reconhecido");
    } else if (fs.length === 1 || fs.every((f) => COM_MES.includes(f))) {
      // Os dois formatos com nome de mês leem igual: não há o que perguntar
      formatoData = fs[0];
    } else {
      // Nunca escolhe dd/mm sem avisar: o usuário responde
      alta = false;
      perguntas.data = fs;
      motivos.push(fs.includes("dd/mm/aaaa") && fs.includes("mm/dd/aaaa") ? "Data pode ser dia/mês ou mês/dia" : "Mais de um formato de data possível");
    }
  }
  let formatoValor: FormatoValor | undefined;
  if (colunas.valor) {
    const r = formatoValorDa(col(colunas.valor).filter((x) => x.trim()));
    if (r.formato) formatoValor = r.formato;
    else {
      alta = false;
      if (r.pergunta) perguntas.valor = r.pergunta;
      motivos.push(r.pergunta ? "Valor pode usar ponto ou vírgula como decimal" : "Formato de valor não reconhecido");
    }
  }
  return {
    layout: colunas,
    formatoData: formatoData ?? (colunas.data ? undefined : "dd/mm/aaaa"),
    formatoValor,
    confianca: alta ? "alta" : "baixa",
    motivos,
    ...(perguntas.data || perguntas.valor ? { perguntas } : {}),
  };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Validação estrita: sem chaves extras, colunas existentes no cabeçalho, enums, referência ≠ valor. */
export function validateLayout(x: unknown, header: string[]): { ok: true; layout: Layout } | { ok: false; erro: string } {
  const bad = (erro: string) => ({ ok: false as const, erro });
  if (!isRec(x) || Object.getPrototypeOf(x) !== Object.prototype && Object.getPrototypeOf(x) !== null) return bad("Layout deve ser um objeto.");
  const keys = Object.keys(x);
  const allowed = ["tipo", "colunas", "formatoData", "formatoValor", "separador", "linhaCabecalho", "moeda"];
  if (keys.some((k) => !allowed.includes(k)) || own(x, "__proto__")) return bad("Layout com campos desconhecidos.");
  if (x.tipo !== "esperados" && x.tipo !== "extrato") return bad("Tipo de layout inválido.");
  if (!FORMATOS_DATA.includes(x.formatoData as FormatoData)) return bad("Formato de data inválido.");
  if (!FORMATOS_VALOR.includes(x.formatoValor as FormatoValor)) return bad("Formato de valor inválido.");
  if (x.moeda !== undefined && !isMoeda(x.moeda)) return bad("Moeda inválida.");
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
    if (k === "forma" && x.tipo !== "esperados") return bad("Coluna de forma de recebimento só vale para esperados.");
    colunas[k] = v;
  }
  if (colunas.referencia === colunas.valor) return bad("Referência e valor precisam ser colunas diferentes.");
  const layout: Layout = { tipo: x.tipo, colunas, formatoData: x.formatoData as FormatoData, formatoValor: x.formatoValor as FormatoValor, linhaCabecalho: x.linhaCabecalho };
  if (x.separador !== undefined) layout.separador = x.separador as Layout["separador"];
  if (x.moeda !== undefined) layout.moeda = x.moeda as Moeda;
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

/** Até `n` valores de exemplo de cada coluna do cabeçalho, mascarados (dígito → 9, letra → a), para a tela de confirmação. */
export function amostrasPorColuna(t: Tabela, linhaCabecalho: number, n = 3): string[][] {
  const header = headerOf(t.linhas, linhaCabecalho);
  const rows = dataRows(t, linhaCabecalho);
  return header.map((_, i) => {
    const out: string[] = [];
    for (const r of rows) {
      const v = (r[i] ?? "").trim();
      if (v) out.push(maskCell(v.slice(0, 40)));
      if (out.length >= Math.min(3, n)) break;
    }
    return out;
  });
}

export type LinhaConvertida = { linha: number; referencia: string; valor?: number; data?: string; pagador?: string; forma?: string; ignorada?: string; erro?: string };

// `indices` (opcional) recebe a posição em t.linhas de cada linha devolvida (para a prova)
function convertRows(t: Tabela, layout: Layout, header: string[], limit = Infinity, indices?: number[]) {
  const idx = (name?: string) => (name ? header.indexOf(name) : -1);
  const I = { ref: idx(layout.colunas.referencia), val: idx(layout.colunas.valor), data: idx(layout.colunas.data), pag: idx(layout.colunas.pagador), desc: idx(layout.colunas.descricao), sinal: idx(layout.colunas.sinal), forma: idx(layout.colunas.forma) };
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
    const forma = layout.tipo === "esperados" ? get(r, I.forma).slice(0, 40) : "";
    if (forma) item.forma = forma;
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
    indices?.push(i);
  }
  return out;
}

/** Primeiras linhas convertidas, com erro ou motivo de ser ignorada (para a prévia na tela). */
export const previewRows = (t: Tabela, layout: Layout, n = 10) => convertRows(t, layout, headerOf(t.linhas, layout.linhaCabecalho), n);

/** Converte a planilha inteira. Linhas inválidas viram BankFileError com o número da linha. */
export function convertWithLayout(t: Tabela, layout: Layout): ExpectedEntry[] | BankEntry[] {
  const pos: number[] = [];
  const rows = convertRows(t, layout, headerOf(t.linhas, layout.linhaCabecalho), Infinity, pos);
  const label = layout.tipo === "esperados" ? "de esperados" : "do banco";
  fileErrors(label, rows.filter((r) => r.erro).map((r) => `Linha ${r.linha}: ${r.erro}`));
  const origem = new Map(rows.map((r, k) => [r, { linha: r.linha, celulas: t.linhas[pos[k]] }]));
  const ok = rows.filter((r) => !r.ignorada && r.valor !== undefined);
  if (!ok.length) throw new BankFileError(`Arquivo ${label}: nenhuma linha com valor válido.`);
  const date = (s?: string) => (s ? new Date(`${s}T00:00:00.000Z`) : undefined);
  return layout.tipo === "esperados"
    ? ok.map((r) => ({ reference: r.referencia, payer: r.pagador, amount: r.valor!, dueAt: date(r.data), ...(r.forma ? { forma: r.forma } : {}), origem: origem.get(r) }))
    : ok.map((r) => ({ reference: r.referencia, payer: r.pagador, amount: r.valor!, paidAt: date(r.data), origem: origem.get(r) }));
}

/** Nomes de coluna que mudaram entre dois layouts (para a auditoria). */
export function layoutDiff(a: Layout, b: Layout): string[] {
  const out: string[] = [];
  for (const k of CAMPOS) if ((a.colunas[k] ?? "") !== (b.colunas[k] ?? "")) out.push(`${k}: ${a.colunas[k] ?? "-"} → ${b.colunas[k] ?? "-"}`);
  if (a.formatoData !== b.formatoData) out.push(`data: ${a.formatoData} → ${b.formatoData}`);
  if (a.formatoValor !== b.formatoValor) out.push(`valor: ${a.formatoValor} → ${b.formatoValor}`);
  if (moedaDoLayout(a) !== moedaDoLayout(b)) out.push(`moeda: ${moedaDoLayout(a)} → ${moedaDoLayout(b)}`);
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
  /** Exemplos mascarados de cada coluna, na ordem do cabeçalho. */
  amostras?: string[][];
  colunas: Partial<Layout["colunas"]>;
  formatoData?: FormatoData;
  formatoValor?: FormatoValor;
  /** Moeda detectada pelos símbolos (ou a escolhida pelo usuário). Ausente: o usuário escolhe. */
  moeda?: Moeda;
  /** Formatos que o sistema não decide sozinho; a tela pergunta. */
  perguntas?: Perguntas;
  confianca: "alta" | "baixa";
  origem: "ia" | "heuristica" | "usuario";
  motivos: string[];
  linhas: LinhaConvertida[];
  erro?: string;
};
/**
 * moedasFixas: moeda dos arquivos já legíveis (OFX/CNAB/CSV antigo = BRL; layout salvo = a dele).
 * precisaCotacao: as moedas diferem e falta a cotação; a tela mostra os campos de câmbio.
 */
export type ResultadoPrevia =
  | { ok: false; erro: string }
  | { ok: true; previas: PreviaArquivo[]; moedasFixas?: Partial<Record<TipoLayout, Moeda>>; precisaCotacao?: true };

/** Índices (no cabeçalho e nas linhas) das colunas de referência, valor e data do layout, para destacar na prova. */
export function colunasDoLayout(layout: Layout, header: string[]) {
  const i = (n?: string) => (n ? header.indexOf(n) : -1);
  const ok = (n: number) => (n >= 0 ? n : undefined);
  return { referencia: ok(i(layout.colunas.referencia)), valor: ok(i(layout.colunas.valor)), data: ok(i(layout.colunas.data)) };
}

/** Moeda detectada na planilha (cabeçalho e até 50 linhas, textos originais). */
export const moedaDaTabela = (t: Tabela, linhaCabecalho: number): Moeda | undefined =>
  detectarMoeda(headerOf(t.linhas, linhaCabecalho), dataRows(t, linhaCabecalho).slice(0, 50));
