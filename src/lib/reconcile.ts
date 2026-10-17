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

export function reconcile(expected: ExpectedEntry[], received: BankEntry[]): ResultItem[] {
  const pending = new Map<string, BankEntry[]>();
  for (const r of received) {
    const k = normRef(r.reference);
    pending.set(k, [...(pending.get(k) ?? []), r]);
  }
  const items: ResultItem[] = [];

  for (const e of expected) {
    const k = normRef(e.reference);
    let hit = pending.get(k)?.shift();
    // Bancos podem anexar o dígito verificador ao nosso número: aceita 1–2 dígitos a mais no final
    if (!hit && /^\d{5,}$/.test(k))
      for (const [key, list] of pending)
        if (list.length && key.startsWith(k) && key.length - k.length <= 2) {
          hit = list.shift();
          break;
        }
    if (!hit) {
      items.push({ reference: e.reference, payer: e.payer, expectedAmount: e.amount, status: "PENDENTE", note: "Pagamento não localizado no arquivo do banco" });
      continue;
    }
    const diff = cents(hit.amount) - cents(e.amount);
    items.push({
      reference: e.reference,
      payer: e.payer ?? hit.payer,
      expectedAmount: e.amount,
      receivedAmount: hit.amount,
      paidAt: hit.paidAt,
      status: diff === 0 ? "CONCILIADO" : "DIVERGENTE",
      note:
        diff === 0
          ? undefined
          : `Diferença de ${(diff / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${diff > 0 ? "pago a maior: juros/multa?" : "pago a menor: desconto/abatimento?"})`,
    });
  }

  for (const rest of pending.values())
    for (const r of rest)
      items.push({ reference: r.reference, payer: r.payer, receivedAmount: r.amount, paidAt: r.paidAt, status: "NAO_ESPERADO", note: "Crédito sem título correspondente" });

  return items;
}
