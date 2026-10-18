// Cobrança: atualização da dívida, política de acordos, mensagem e Pix.
import { aiProvider, claudeJson } from "./ai";
import { DEFAULTS, type Band, type Settings } from "./settings";

export type CollectionCfg = Settings["collection"];
export type PixCfg = Settings["pix"];

export const daysBetween = (from: Date, to = new Date()) =>
  Math.max(0, Math.floor((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - from.getTime()) / 86_400_000));

export const debtStatus: Record<string, [string, string]> = {
  EM_ABERTO: ["Em aberto", "bg-red-100 text-red-800"],
  NEGOCIANDO: ["Proposta enviada", "bg-amber-100 text-amber-800"],
  ACORDO: ["Acordo fechado", "bg-blue-100 text-blue-800"],
  QUITADO: ["Recuperado", "bg-emerald-100 text-emerald-800"],
};

const r2 =(n: number) => Math.round(n * 100) / 100;

// Multa limitada a 2% (CDC, art. 52, §1º) e juros de mora pro rata dia
export function updateDebt(principal: number, dueDate: Date, today = new Date(), cfg: CollectionCfg = DEFAULTS.collection) {
  const days = daysBetween(dueDate, today);
  const multa = days > 0 ? r2(principal * Math.min(cfg.multa, 0.02)) : 0;
  const juros = r2(principal * cfg.jurosMes * (days / 30));
  return { days, multa, juros, total: r2(principal + multa + juros) };
}

// Faixas de atraso: desconto à vista e condição máxima de parcelamento (configuráveis por instituição)
export const BANDS = DEFAULTS.collection.bands;

export const bandOf = (days: number, bands: Band[] = BANDS) => bands.find((b) => days <= b.maxDays) ?? bands[bands.length - 1];

export type Option = { label: string; installments: number; discountPct: number; total: number; installment: number };

export function buildOptions(updated: number, principal: number, days: number, cfg: CollectionCfg = DEFAULTS.collection): Option[] {
  const band = bandOf(days, cfg.bands);
  const MIN_INSTALLMENT = cfg.minInstallment;
  // O desconto nunca reduz o acordo abaixo do piso sobre o valor original
  const floor = principal * cfg.floorPct;
  const make = (installments: number, pct: number, label: string): Option => {
    const total = r2(Math.max(updated * (1 - pct), floor));
    return { label, installments, discountPct: r2((1 - total / updated) * 100), total, installment: r2(total / installments) };
  };
  const opts = [make(1, band.cash, "À vista")];
  const steps = [3, 6, 12, 18, 24].filter((n) => n <= band.maxInstallments);
  for (const n of steps) {
    // Prazos mais longos recebem menos desconto, para incentivar a quitação rápida
    const o = make(n, band.parcel * (n <= 6 ? 1 : n <= 12 ? 0.6 : 0.3), `${n}x`);
    if (o.installment >= MIN_INSTALLMENT) opts.push(o);
  }
  return opts;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type DebtInfo = { debtor: string; contract: string; product?: string | null; principal: number; dueDate: Date };

export async function proposal(d: DebtInfo, link: string, cfg: CollectionCfg = DEFAULTS.collection, merchant = process.env.PIX_MERCHANT ?? "") {
  const upd = updateDebt(d.principal, d.dueDate, new Date(), cfg);
  const options = buildOptions(upd.total, d.principal, upd.days, cfg);
  // Recomendação: à vista para dívidas menores; parcelado intermediário para as maiores
  const recommended = upd.total <= 3000 || options.length === 1 ? 0 : Math.min(2, options.length - 1);
  const first = d.debtor.split(" ")[0];
  const best = options[0];
  const parc = options[options.length - 1];

  let message = [
    `Olá, ${first}! Aqui é da ${merchant ? titleCase(merchant) : "sua instituição"}.`,
    `Temos uma condição especial para regularizar o contrato ${d.contract}${d.product ? ` (${d.product})` : ""}:`,
    `• À vista: ${fmt(best.total)}${best.discountPct > 0 ? ` (${best.discountPct.toFixed(0)}% de desconto)` : ""}`,
    options.length > 1 ? `• Ou em até ${parc.installments}x de ${fmt(parc.installment)}` : "",
    `Veja as opções e pague por Pix em: ${link}`,
    `Proposta válida por ${cfg.validityDays} dias. Se já pagou, desconsidere esta mensagem.`,
  ]
    .filter(Boolean)
    .join("\n");

  const provider = aiProvider();
  if (provider === "claude") {
    const r = await claudeJson<{ message: string }>(
      "Você redige mensagens de negociação de dívidas para WhatsApp em nome de uma instituição financeira brasileira. Seja cordial, claro e respeitoso; siga o art. 42 do CDC (sem ameaças, constrangimento ou exposição). Mensagem curta, sem emojis em excesso.",
      `Reescreva a mensagem abaixo de forma mais persuasiva e humana, mantendo exatamente os valores, o contrato e o link.
Dias em atraso: ${upd.days}. Retorne JSON {"message": string}.

${message}`,
    );
    message = r.message;
  }

  return { ...upd, options, recommended, message, provider };
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

// ---- Pix "copia e cola" (BR Code estático, padrão EMV do Banco Central) ----

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

export function crc16(payload: string) {
  let crc = 0xffff;
  for (const ch of Buffer.from(payload, "utf8")) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const ascii = (s: string, max: number) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .\-@]/g, "").toUpperCase().slice(0, max);

// txid da parcela: identifica o acordo e o número da parcela no webhook de baixa automática
export const pixTxid = (token: string, installment: number) => `ACD${token}P${installment}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 25);

export function parseTxid(txid: string) {
  const m = txid.match(/^ACD([A-Za-z0-9]+)P(\d+)$/);
  return m ? { tokenPrefix: m[1], installment: +m[2] } : null;
}

export function pixPayload(amount: number, txid: string, description?: string, pix: PixCfg = DEFAULTS.pix) {
  const key = pix.key.trim();
  if (!key || !(amount > 0)) return null;
  const account = tlv("00", "br.gov.bcb.pix") + tlv("01", key) + (description ? tlv("02", ascii(description, 40)) : "");
  const body =
    tlv("00", "01") +
    tlv("26", account) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", amount.toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", ascii(pix.merchant || "RECEBEDOR", 25)) +
    tlv("60", ascii(pix.city || "SAO PAULO", 15)) +
    tlv("62", tlv("05", txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25))) +
    "6304";
  return body + crc16(body);
}

// ---- Importação da carteira (CSV) ----

export type DebtRow = {
  contract: string;
  debtor: string;
  document: string;
  phone?: string;
  email?: string;
  product?: string;
  principal: number;
  dueDate: Date;
};

export function parseDebtsCsv(text: string): DebtRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = lines[0]?.includes(";") ? ";" : ",";
  const keys = (lines[0] ?? "")
    .split(sep)
    .map((h) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, ""));
  const money = (s: string) => (s.includes(",") ? Number(s.replace(/[R$\s.]/g, "").replace(",", ".")) : Number(s));
  const date = (s: string) => {
    const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/) ?? s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return new Date(NaN);
    return s.includes("/") ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  };
  return lines.slice(1).flatMap((l) => {
    const c = Object.fromEntries(l.split(sep).map((v, i) => [keys[i], v.trim().replace(/^"|"$/g, "")]));
    const row: DebtRow = {
      contract: c.contrato || c.contract,
      debtor: c.devedor || c.cliente || c.nome,
      document: c.cpfcnpj || c.cpf || c.documento,
      phone: c.telefone || c.celular || undefined,
      email: c.email || undefined,
      product: c.produto || undefined,
      principal: money(c.valor || c.valororiginal || c.saldo || ""),
      dueDate: date(c.vencimento || ""),
    };
    return row.contract && row.debtor && row.principal > 0 && !isNaN(row.dueDate.getTime()) ? [row] : [];
  });
}

// Decide como um pagamento afeta o acordo. "strict" (registro manual) recusa valor acima do saldo;
// "accept_excess" (webhook Pix: o dinheiro já entrou) registra tudo e devolve o excedente para revisão.
export type PaymentDecision =
  | { kind: "reject_overpaid"; remaining: number }
  | { kind: "apply"; paid: number; settled: boolean; overpaid: number };


export function decidePayment(total: number, alreadyPaid: number, amount: number, mode: "strict" | "accept_excess"): PaymentDecision {
  const remaining = r2(total - alreadyPaid);
  if (mode === "strict" && amount > remaining + 0.01) return { kind: "reject_overpaid", remaining };
  const paid = r2(alreadyPaid + amount);
  const excess = r2(paid - total);
  // Diferença de até 1 centavo é arredondamento, não pagamento a maior
  return { kind: "apply", paid, settled: paid >= total - 0.01, overpaid: excess > 0.01 ? excess : 0 };
}
