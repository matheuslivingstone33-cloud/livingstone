// Leitura de arquivos bancários e conciliação contra os títulos esperados.

export type BankEntry = { reference: string; payer?: string; amount: number; paidAt?: Date };
export type ExpectedEntry = { reference: string; payer?: string; amount: number; dueAt?: Date };

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

const normRef = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "") || s.trim().toUpperCase();

function parseMoney(raw: string): number {
  const s = raw.trim().replace(/[R$\s]/g, "");
  // "1.234,56" -> 1234.56 ; "1234.56" -> 1234.56
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s);
}

function parseDate(raw: string): Date | undefined {
  const s = raw.trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{4})(\d{2})(\d{2})/); // OFX: AAAAMMDD...
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return undefined;
}

function splitCsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = (lines[0]?.match(/;/g)?.length ?? 0) >= (lines[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
}

function csvObjects(text: string) {
  const [header, ...rows] = splitCsv(text);
  if (!header) return [];
  const keys = header.map((h) =>
    h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, ""),
  );
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

const pick = (o: Record<string, string>, ...names: string[]) => {
  for (const n of names) if (o[n]) return o[n];
  return "";
};

export function parseExpectedCsv(text: string): ExpectedEntry[] {
  return csvObjects(text)
    .map((o) => ({
      reference: pick(o, "referencia", "nossonumero", "documento", "id"),
      payer: pick(o, "pagador", "cliente", "sacado", "nome") || undefined,
      amount: parseMoney(pick(o, "valor", "valortitulo", "valoresperado")),
      dueAt: parseDate(pick(o, "vencimento", "data")),
    }))
    .filter((e) => e.reference && Number.isFinite(e.amount));
}

function parseBankCsv(text: string): BankEntry[] {
  return csvObjects(text)
    .map((o) => ({
      reference: pick(o, "referencia", "nossonumero", "documento", "id"),
      payer: pick(o, "pagador", "cliente", "sacado", "nome") || undefined,
      amount: parseMoney(pick(o, "valorpago", "valor", "valorrecebido")),
      paidAt: parseDate(pick(o, "datapagamento", "data", "datacredito")),
    }))
    .filter((e) => e.reference && Number.isFinite(e.amount));
}

function parseOfx(text: string): BankEntry[] {
  const tag = (block: string, name: string) =>
    block.match(new RegExp(`<${name}>([^<\r\n]*)`, "i"))?.[1]?.trim() ?? "";
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  return blocks
    .map((b) => {
      const memo = tag(b, "MEMO");
      const amount = Number(tag(b, "TRNAMT").replace(",", "."));
      // A referência do título costuma vir em REFNUM/CHECKNUM ou no histórico (MEMO)
      const reference =
        tag(b, "REFNUM") || tag(b, "CHECKNUM") || memo.match(/\b\d{5,}\b/)?.[0] || tag(b, "FITID");
      return { reference, payer: tag(b, "NAME") || memo || undefined, amount, paidAt: parseDate(tag(b, "DTPOSTED")) };
    })
    .filter((e) => e.amount > 0); // apenas créditos
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

export class BankFileError extends Error {}

function parseCnab400(text: string, layout: Cnab400Layout): BankEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l[0] === "1");
  const out: BankEntry[] = [];
  lines.forEach((l, i) => {
    if (l.length < layout.valorPago[1]) throw new BankFileError(`CNAB 400: a linha de detalhe ${i + 1} tem ${l.length} posições (esperado 400).`);
    if (!layout.codigosLiquidacao.includes(cut(l, layout.ocorrencia))) return;
    const d = cut(l, layout.dataOcorrencia);
    const v = cut(l, layout.valorPago);
    if (!/^\d+$/.test(v) || !/^\d{6}$/.test(d))
      throw new BankFileError(`CNAB 400: valor ou data não numéricos na linha de detalhe ${i + 1}. Confira o layout do banco em Configurações.`);
    out.push({
      reference: cut(l, layout.nossoNumero).trim(),
      amount: Number(v) / 100,
      paidAt: new Date(Date.UTC(2000 + +d.slice(4, 6), +d.slice(2, 4) - 1, +d.slice(0, 2))),
    });
  });
  return out;
}

// CNAB 240 de retorno de cobrança, padrão FEBRABAN: segmento T (título) seguido do segmento U (valores).
// T: nosso número 38-57, valor do título 82-96 · U: valor pago 78-92, data da ocorrência 138-145 (DDMMAAAA).
// Código de movimento 16-17: 06 liquidação, 09 baixa, 17 liquidação após baixa.
function parseCnab240(text: string): BankEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length >= 240 && l[7] === "3");
  const out: BankEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (t[13] !== "T") continue;
    const u = lines[i + 1];
    if (!u || u[13] !== "U") throw new BankFileError(`CNAB 240: segmento T sem o segmento U correspondente (registro ${i + 1}).`);
    if (!["06", "17"].includes(t.slice(15, 17))) continue;
    const d = u.slice(137, 145);
    out.push({
      reference: t.slice(37, 57).trim(),
      payer: t.slice(148, 188).trim() || undefined,
      amount: Number(u.slice(77, 92)) / 100,
      paidAt: /^\d{8}$/.test(d) ? new Date(Date.UTC(+d.slice(4, 8), +d.slice(2, 4) - 1, +d.slice(0, 2))) : undefined,
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
export type MatchedItem = ResultItem & { rule?: MatchRule; dueAt?: Date; excess?: number };

export type ReconcileOptions = {
  /** Diferença de valor (em centavos) aceita como conciliada; 0 = só valor exato */
  toleranciaCentavos: number;
  /** Liga a 2ª passada: sem referência, casa por valor exato e data dentro de ±toleranciaDias */
  casarPorValorData: boolean;
  toleranciaDias: number;
};

export const DEFAULT_RECONCILE: ReconcileOptions = { toleranciaCentavos: 0, casarPorValorData: false, toleranciaDias: 0 };

const DAY = 86_400_000;
const money = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function reconcileWith(expected: ExpectedEntry[], received: BankEntry[], options: Partial<ReconcileOptions> = {}): MatchedItem[] {
  const opts = { ...DEFAULT_RECONCILE, ...options };
  const pool = received.map((r) => ({ r, key: normRef(r.reference), used: false }));
  const hits: ({ r: BankEntry; rule: MatchRule } | undefined)[] = [];

  // 1ª passada: referência exata; depois, nosso número com 1–2 dígitos verificadores anexados pelo banco
  for (const e of expected) {
    const k = normRef(e.reference);
    let rule: MatchRule = "REFERENCIA";
    let c = pool.find((p) => !p.used && p.key === k);
    if (!c && /^\d{5,}$/.test(k)) {
      c = pool.find((p) => !p.used && p.key.startsWith(k) && p.key.length - k.length <= 2);
      rule = "REFERENCIA_DV";
    }
    if (c) c.used = true;
    hits.push(c && { r: c.r, rule });
  }

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
      hits[i] = { r: cands[0].r, rule: "VALOR_DATA" };
    }
  }

  const items: MatchedItem[] = expected.map((e, i): MatchedItem => {
    const h = hits[i];
    if (!h)
      return {
        reference: e.reference, payer: e.payer, expectedAmount: e.amount, dueAt: e.dueAt, status: "PENDENTE",
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
    };
  });

  for (const p of pool)
    if (!p.used)
      items.push({ reference: p.r.reference, payer: p.r.payer, receivedAmount: p.r.amount, paidAt: p.r.paidAt, status: "NAO_ESPERADO", note: "Crédito sem título correspondente" });

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
