// Leitura de arquivos bancários e conciliação contra os títulos esperados.
import { fmtCentavos, type Moeda } from "./moeda";

/** De onde veio o lançamento: número da linha e as células (CSV/planilha) ou o trecho bruto (OFX/CNAB/JSON). */
export type Origem = { linha: number; celulas?: string[]; bruto?: string };
export type BankEntry = { reference: string; payer?: string; amount: number; paidAt?: Date; origem?: Origem };
/** forma: forma de recebimento do título (ex.: "credito", "pix"), usada só para a pista de taxa de cartão. */
export type ExpectedEntry = { reference: string; payer?: string; amount: number; dueAt?: Date; forma?: string; origem?: Origem };

export class BankFileError extends Error {}

export type ItemStatus = "CONCILIADO" | "DIVERGENTE" | "PENDENTE" | "NAO_ESPERADO";
export type ResultItem = {
  reference: string;
  payer?: string;
  expectedAmount?: number;
  receivedAmount?: number;
  paidAt?: Date;
  status: ItemStatus;
  note?: string;
};

// Ignora caixa e separadores (espaço, hífen, ponto, barra). Letras contam: "ABC-1" ≠ "XYZ-1".
// Só referências puramente numéricas perdem os zeros à esquerda ("00012345" = "12345").
export const normRef = (s: string) => {
  const t = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^\d+$/.test(t) ? t.replace(/^0+/, "") || "0" : t;
};

/** Dia de calendário em UTC; undefined se a data não existe (31/02, mês 13...). */
export function utcDay(y: number, m: number, d: number): Date | undefined {
  if (![y, m, d].every(Number.isInteger)) return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : undefined;
}

/**
 * Valor monetário em texto → número, ou null se ilegível. Remove "R$" e espaços; aceita "-" inicial.
 * "br" (CSV): vírgula é decimal ("1.234,56", "12,5"). Sem vírgula, "1.234" e "1.234.567" são milhar,
 *   e "1234.56"/"1.5" são decimal com ponto. ATENÇÃO: "1.500" é ambíguo e vira 1500 (milhar), não 1,5.
 * "ofx": ponto decimal primeiro ("1500.00"); se não casar, aplica as regras "br" ("1.234,56" → 1234.56).
 * Qualquer outra forma ("12,345", "abc", "1,2,3") → null.
 */
export function parseMoney(raw: string, mode: "br" | "ofx" = "br"): number | null {
  const s = raw.trim().replace(/R\$/g, "").replace(/\s/g, "");
  if (mode === "ofx" && /^-?\d+(\.\d{1,2})?$/.test(s)) return Number(s);
  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^-?\d+(,\d{1,2})?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  if (/^-?\d+(\.\d{1,2})?$/.test(s)) return Number(s);
  return null;
}

/**
 * Valor no formato dos EUA → número, ou null se ilegível. Aceita os prefixos "$", "US$", "USD" e "U$",
 * vírgula de milhar e ponto decimal ("1,234.56", "1,234", "1234.5"), "-" inicial e parênteses contábeis
 * ("(150.00)" = -150). "1.234,56" (formato BR) e "12,34" → null.
 */
export function parseMoneyUs(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "");
  let neg = false;
  const par = s.match(/^\((.*)\)$/);
  if (par) {
    neg = true;
    s = par[1];
  }
  if (s.startsWith("-")) {
    if (neg) return null;
    neg = true;
    s = s.slice(1);
  }
  s = s.replace(/^(US\$|USD|U\$|\$)/i, "");
  if (s.startsWith("-") && !neg) {
    neg = true;
    s = s.slice(1);
  }
  if (!/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s) && !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return neg ? -n : n;
}

/** Tamanho máximo de uma referência (acima disso é erro; truncar poderia casar títulos diferentes). */
export const REF_MAX = 60;

export const validMoney = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0 && n < 1e12;

/** undefined = campo vazio; null = preenchido mas inválido. Aceita dd/mm/aaaa, aaaa-mm-dd[hora] e aaaammdd[hora]. */
export function parseDate(raw: string): Date | undefined | null {
  const s = raw.trim();
  if (!s) return undefined;
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return utcDay(+m[3], +m[2], +m[1]) ?? null;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return utcDay(+m[1], +m[2], +m[3]) ?? null;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/); // OFX: AAAAMMDD...
  if (m) return utcDay(+m[1], +m[2], +m[3]) ?? null;
  return null;
}

function splitCsv(text: string): { line: number; cells: string[] }[] {
  const all = text.replace(/^﻿/, "").split(/\r?\n/);
  const lines = all.map((l, i) => ({ l, line: i + 1 })).filter((x) => x.l.trim());
  const first = lines[0]?.l ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map(({ l, line }) => ({ line, cells: l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")) }));
}

function csvObjects(text: string) {
  const [header, ...rows] = splitCsv(text);
  if (!header) return [];
  const keys = header.cells.map((h) =>
    h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, ""),
  );
  return rows.map((r) => ({ line: r.line, cells: r.cells, o: Object.fromEntries(keys.map((k, i) => [k, r.cells[i] ?? ""])) as Record<string, string> }));
}

/** Cabeçalho do CSV no formato antigo, como está no arquivo (para a prova). */
export const csvHeader = (text: string): string[] => splitCsv(text)[0]?.cells ?? [];

const pick = (o: Record<string, string>, ...names: string[]) => {
  for (const n of names) if (o[n]) return o[n];
  return "";
};

export function fileErrors(label: string, errors: string[]) {
  if (errors.length)
    throw new BankFileError(`Arquivo ${label}: ${errors.length} linha(s) inválida(s). ${errors.slice(0, 5).join("; ")}${errors.length > 5 ? "…" : ""}`);
}

// Lê linhas de CSV (esperados ou banco). Linha toda vazia é ignorada; referência sem valor/data válidos é erro.
function parseCsvRows(text: string, label: string, valueCols: string[], dateCols: string[]) {
  const errors: string[] = [];
  const out: { reference: string; payer?: string; amount: number; date?: Date; forma?: string; origem: Origem }[] = [];
  for (const { line, cells, o } of csvObjects(text)) {
    if (Object.values(o).every((v) => !v.trim())) continue;
    const reference = pick(o, "referencia", "nossonumero", "documento", "id");
    const rawValue = pick(o, ...valueCols);
    const rawDate = pick(o, ...dateCols);
    if (!reference) {
      if (rawValue) errors.push(`Linha ${line}: referência obrigatória`);
      continue;
    }
    const amount = parseMoney(rawValue, "br");
    const date = parseDate(rawDate);
    if (!rawValue) errors.push(`Linha ${line}: valor obrigatório`);
    else if (amount === null || !Number.isFinite(amount)) errors.push(`Linha ${line}: valor ${rawValue} ilegível`);
    else if (!validMoney(amount)) errors.push(`Linha ${line}: valor ${rawValue} deve ser positivo`);
    if (date === null) errors.push(`Linha ${line}: data ${rawDate} inválida`);
    const forma = pick(o, "forma", "formapagamento", "meiopagamento", "tipopagamento").trim().slice(0, 40);
    if (validMoney(amount) && date !== null)
      out.push({
        reference,
        payer: pick(o, "pagador", "cliente", "sacado", "nome") || undefined,
        amount,
        date,
        ...(forma ? { forma } : {}),
        origem: { linha: line, celulas: cells },
      });
  }
  fileErrors(label, errors);
  return out;
}

export function parseExpectedCsv(text: string): ExpectedEntry[] {
  return parseCsvRows(text, "de esperados", ["valor", "valortitulo", "valoresperado"], ["vencimento", "data"]).map(
    ({ date, ...e }) => ({ ...e, dueAt: date }),
  );
}

function parseBankCsv(text: string): BankEntry[] {
  // A forma de recebimento só vale para esperados: a do extrato é descartada
  return parseCsvRows(text, "do banco", ["valorpago", "valor", "valorrecebido"], ["datapagamento", "data", "datacredito"]).map(
    ({ date, reference, payer, amount, origem }) => ({ reference, payer, amount, paidAt: date, origem }),
  );
}

function parseOfx(text: string): BankEntry[] {
  const tag = (block: string, name: string) =>
    block.match(new RegExp(`<${name}>([^<\r\n]*)`, "i"))?.[1]?.trim() ?? "";
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const errors: string[] = [];
  const out: BankEntry[] = [];
  blocks.forEach((b, i) => {
    const fitid = tag(b, "FITID");
    const rawAmount = tag(b, "TRNAMT");
    const amount = parseMoney(rawAmount, "ofx");
    if (amount === null || !Number.isFinite(amount)) return void errors.push(`Transação ${i + 1} (FITID ${fitid || "-"}): valor '${rawAmount}' ilegível`);
    if (amount <= 0) return; // débito: não é pagamento recebido
    if (amount >= 1e12) return void errors.push(`Transação ${i + 1} (FITID ${fitid || "-"}): valor '${rawAmount}' fora do limite`);
    const rawDate = tag(b, "DTPOSTED");
    const paidAt = parseDate(rawDate);
    if (paidAt === null) return void errors.push(`Transação ${i + 1} (FITID ${fitid || "-"}): data '${rawDate}' inválida`);
    const memo = tag(b, "MEMO");
    // A referência do título costuma vir em REFNUM/CHECKNUM ou no histórico (MEMO)
    const reference = tag(b, "REFNUM") || tag(b, "CHECKNUM") || memo.match(/\b\d{5,}\b/)?.[0] || fitid;
    out.push({ reference, payer: tag(b, "NAME") || memo || undefined, amount, paidAt, origem: { linha: i + 1, bruto: `<STMTTRN>${b.trim()}</STMTTRN>`.slice(0, 1000) } });
  });
  fileErrors("OFX", errors);
  return out;
}

// Posições 1-based [início, fim] do registro detalhe; cada banco usa um layout próprio (configurável por instituição)
export type Cnab400Layout = {
  nossoNumero: [number, number];
  ocorrencia: [number, number];
  dataOcorrencia: [number, number];
  valorPago: [number, number];
  codigosLiquidacao: string[];
};

export const DEFAULT_CNAB400: Cnab400Layout = {
  nossoNumero: [63, 70],
  ocorrencia: [109, 110],
  dataOcorrencia: [111, 116],
  valorPago: [254, 266],
  codigosLiquidacao: ["06", "08", "10"],
};

const cut = (l: string, [a, b]: [number, number]) => l.slice(a - 1, b);

function parseCnab400(text: string, layout: Cnab400Layout): BankEntry[] {
  const todas = text.split(/\r?\n/);
  const nums = todas.map((_, n) => n + 1).filter((n) => todas[n - 1][0] === "1");
  const lines = nums.map((n) => todas[n - 1]);
  const out: BankEntry[] = [];
  lines.forEach((l, i) => {
    if (l.length < layout.valorPago[1]) throw new BankFileError(`CNAB 400: a linha de detalhe ${i + 1} tem ${l.length} posições (esperado 400).`);
    if (!layout.codigosLiquidacao.includes(cut(l, layout.ocorrencia))) return;
    const d = cut(l, layout.dataOcorrencia);
    const v = cut(l, layout.valorPago);
    if (!/^\d+$/.test(v) || !/^\d{6}$/.test(d))
      throw new BankFileError(`CNAB 400: valor ou data não numéricos na linha de detalhe ${i + 1}. Confira o layout do banco em Configurações.`);
    const paidAt = utcDay(2000 + +d.slice(4, 6), +d.slice(2, 4), +d.slice(0, 2));
    if (!paidAt) throw new BankFileError(`CNAB 400: data ${d} inválida na linha de detalhe ${i + 1}.`);
    if (!(Number(v) > 0)) throw new BankFileError(`CNAB 400: liquidação com valor zero na linha de detalhe ${i + 1}.`);
    out.push({ reference: cut(l, layout.nossoNumero).trim(), amount: Number(v) / 100, paidAt, origem: { linha: nums[i], bruto: l } });
  });
  return out;
}

// CNAB 240 de retorno de cobrança, padrão FEBRABAN: segmento T (título) seguido do segmento U (valores).
// T: nosso número 38-57, valor do título 82-96 · U: valor pago 78-92, data da ocorrência 138-145 (DDMMAAAA).
// Código de movimento 16-17: 06 liquidação, 09 baixa, 17 liquidação após baixa.
function parseCnab240(text: string): BankEntry[] {
  const todas = text.split(/\r?\n/);
  const nums = todas.map((_, n) => n + 1).filter((n) => todas[n - 1].length >= 240 && todas[n - 1][7] === "3");
  const lines = nums.map((n) => todas[n - 1]);
  const out: BankEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (t[13] !== "T") continue;
    const u = lines[i + 1];
    if (!u || u[13] !== "U") throw new BankFileError(`CNAB 240: segmento T sem o segmento U correspondente (registro ${i + 1}).`);
    if (!["06", "17"].includes(t.slice(15, 17))) continue;
    const d = u.slice(137, 145);
    const v = u.slice(77, 92);
    // Data em branco ou zerada é tolerada (sem data); preenchida tem de ser DDMMAAAA válida
    let paidAt: Date | undefined;
    if (d.trim() && !/^0+$/.test(d)) {
      paidAt = /^\d{8}$/.test(d) ? utcDay(+d.slice(4, 8), +d.slice(2, 4), +d.slice(0, 2)) : undefined;
      if (!paidAt) throw new BankFileError(`CNAB 240: data ${d.trim()} inválida no segmento U (registro ${i + 2}).`);
    }
    if (!/^\d+$/.test(v) || !(Number(v) > 0)) throw new BankFileError(`CNAB 240: valor pago ausente ou zero no segmento U (registro ${i + 2}).`);
    out.push({
      reference: t.slice(37, 57).trim(),
      payer: t.slice(148, 188).trim() || undefined,
      amount: Number(v) / 100,
      paidAt,
      origem: { linha: nums[i], bruto: `${t}\n${u}` },
    });
  }
  return out;
}

export type BankFormat = "OFX" | "CNAB400" | "CNAB240" | "CSV";

export function detectBankFormat(fileName: string, text: string): BankFormat {
  if (/<OFX>|OFXHEADER/i.test(text) || /\.ofx$/i.test(fileName)) return "OFX";
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length && lines.every((l) => l.length === 240)) return "CNAB240";
  if (lines[0]?.startsWith("02RETORNO") || (lines.length && lines.every((l) => l.length === 400))) return "CNAB400";
  return "CSV";
}

export function parseBankFile(fileName: string, text: string, cnab400: Cnab400Layout = DEFAULT_CNAB400) {
  const format = detectBankFormat(fileName, text);
  const entries =
    format === "OFX" ? parseOfx(text)
    : format === "CNAB400" ? parseCnab400(text, cnab400)
    : format === "CNAB240" ? parseCnab240(text)
    : parseBankCsv(text);
  if (!entries.length)
    throw new BankFileError(
      `Nenhum pagamento encontrado no arquivo (${format}). ${format === "CSV" ? "Confira se há as colunas referencia e valor." : "Confira se é um arquivo de retorno com liquidações."}`,
    );
  return { format, entries };
}

const cents = (n: number) => Math.round(n * 100);

export type MatchRule = "REFERENCIA" | "REFERENCIA_DV" | "VALOR_DATA";
/** expectedIndex/receivedIndex: posição do título e do crédito nas listas recebidas (para montar a prova). */
export type MatchedItem = ResultItem & { rule?: MatchRule; dueAt?: Date; excess?: number; expectedIndex?: number; receivedIndex?: number };

export type ReconcileOptions = {
  /** Diferença de valor (em centavos) aceita como conciliada; 0 = só valor exato */
  toleranciaCentavos: number;
  /** Liga a 2ª passada: sem referência, casa por valor exato e data dentro de ±toleranciaDias */
  casarPorValorData: boolean;
  toleranciaDias: number;
  /** Moeda das notas de diferença (padrão BRL). Não muda nenhuma decisão. */
  moeda?: Moeda;
};

export const DEFAULT_RECONCILE: ReconcileOptions = { toleranciaCentavos: 0, casarPorValorData: false, toleranciaDias: 0 };

const DAY = 86_400_000;

export function reconcileWith(expected: ExpectedEntry[], received: BankEntry[], options: Partial<ReconcileOptions> = {}): MatchedItem[] {
  const opts = { ...DEFAULT_RECONCILE, ...options };
  const money = (c: number) => fmtCentavos(c, opts.moeda ?? "BRL");
  const pool = received.map((r, j) => ({ r, j, key: normRef(r.reference), used: false }));
  const hits: ({ r: BankEntry; j: number; rule: MatchRule } | undefined)[] = [];

  // 1ª passada (a): referência exata, para todos os títulos antes de olhar dígito verificador
  const keys = expected.map((e) => normRef(e.reference));
  keys.forEach((k, i) => {
    const c = pool.find((p) => !p.used && p.key === k);
    if (c) c.used = true;
    hits[i] = c && { r: c.r, j: c.j, rule: "REFERENCIA" };
  });
  // 1ª passada (b): nosso número com 1–2 dígitos verificadores anexados pelo banco, só nos créditos que sobraram
  const dvMatch = (k: string, key: string) => /^\d{5,}$/.test(k) && key.startsWith(k) && key.length - k.length >= 1 && key.length - k.length <= 2;
  keys.forEach((k, i) => {
    if (hits[i]) return;
    const c = pool.find((p) => !p.used && dvMatch(k, p.key));
    if (c) c.used = true;
    hits[i] = c && { r: c.r, j: c.j, rule: "REFERENCIA_DV" };
  });

  // 2ª passada: valor exato e data próxima. Só casa quando o par é único dos dois lados (evita falso positivo)
  const ambiguous = new Set<number>();
  if (opts.casarPorValorData) {
    const near = (e: ExpectedEntry, r: BankEntry) =>
      cents(e.amount) === cents(r.amount) &&
      !!e.dueAt && !!r.paidAt &&
      Math.abs(r.paidAt.getTime() - e.dueAt.getTime()) <= opts.toleranciaDias * DAY;
    const open = expected.map((e, i) => ({ e, i })).filter(({ i }) => !hits[i]);
    for (const { e, i } of open) {
      const cands = pool.filter((p) => !p.used && near(e, p.r));
      if (cands.length > 1) ambiguous.add(i);
      if (cands.length !== 1) continue;
      if (open.filter((o) => !hits[o.i] && near(o.e, cands[0].r)).length > 1) {
        ambiguous.add(i);
        continue;
      }
      cands[0].used = true;
      hits[i] = { r: cands[0].r, j: cands[0].j, rule: "VALOR_DATA" };
    }
  }

  const items: MatchedItem[] = expected.map((e, i): MatchedItem => {
    const h = hits[i];
    if (!h)
      return {
        reference: e.reference, payer: e.payer, expectedAmount: e.amount, dueAt: e.dueAt, status: "PENDENTE", expectedIndex: i,
        note: ambiguous.has(i) ? "Mais de um crédito com o mesmo valor e data: concilie manualmente" : "Pagamento não localizado no arquivo do banco",
      };
    const diff = cents(h.r.amount) - cents(e.amount);
    const within = Math.abs(diff) <= opts.toleranciaCentavos;
    const notes = [
      h.rule === "VALOR_DATA" ? "Casado por valor e data (sem referência no banco)" : undefined,
      diff === 0 ? undefined
      : within ? `Diferença de ${money(diff)} dentro da tolerância`
      : `Diferença de ${money(diff)} (${diff > 0 ? "pago a maior: juros/multa?" : "pago a menor: desconto/abatimento?"})`,
    ].filter(Boolean);
    return {
      reference: e.reference,
      payer: e.payer ?? h.r.payer,
      expectedAmount: e.amount,
      receivedAmount: h.r.amount,
      paidAt: h.r.paidAt,
      dueAt: e.dueAt,
      rule: h.rule,
      status: within ? "CONCILIADO" : "DIVERGENTE",
      excess: diff > 0 && !within ? diff / 100 : undefined,
      note: notes.join(" · ") || undefined,
      expectedIndex: i,
      receivedIndex: h.j,
    };
  });

  for (const p of pool)
    if (!p.used)
      items.push({ reference: p.r.reference, payer: p.r.payer, receivedAmount: p.r.amount, paidAt: p.r.paidAt, status: "NAO_ESPERADO", note: "Crédito sem título correspondente", receivedIndex: p.j });

  return items;
}

/** Atalho com as regras padrão: só referência e valor exato */
export function reconcile(expected: ExpectedEntry[], received: BankEntry[]): MatchedItem[] {
  return reconcileWith(expected, received);
}

export function summarize(items: MatchedItem[]) {
  const n = (st: ItemStatus) => items.filter((i) => i.status === st).length;
  return {
    matched: n("CONCILIADO"),
    divergent: n("DIVERGENTE"),
    missing: n("PENDENTE"),
    unexpected: n("NAO_ESPERADO"),
    excess: items.reduce((a, i) => a + cents(i.excess ?? 0), 0) / 100,
  };
}
