// Configurações por instituição. Valores ausentes caem nos padrões abaixo.
import { db } from "./db";

export type Band = { label: string; maxDays: number; cash: number; parcel: number; maxInstallments: number };

export const DEFAULTS = {
  pix: {
    key: process.env.PIX_KEY ?? "",
    merchant: process.env.PIX_MERCHANT ?? "",
    city: process.env.PIX_CITY ?? "",
    // Segredo que o PSP envia no webhook (cabeçalho x-webhook-secret) para baixa automática
    webhookSecret: "",
  },
  // Posições 1-based [início, fim] do registro detalhe do CNAB 400 de retorno
  cnab400: {
    nossoNumero: [63, 70] as [number, number],
    ocorrencia: [109, 110] as [number, number],
    dataOcorrencia: [111, 116] as [number, number],
    valorPago: [254, 266] as [number, number],
    codigosLiquidacao: ["06", "08", "10"],
  },
  credit: { maxCommitment: 0.35, warnCommitment: 0.25, approveScore: 700, rejectScore: 450 },
  collection: {
    multa: 0.02,
    jurosMes: 0.01,
    floorPct: 0.4,
    minInstallment: 50,
    validityDays: 7,
    bands: [
      { label: "1–30 dias", maxDays: 30, cash: 0.05, parcel: 0, maxInstallments: 3 },
      { label: "31–90 dias", maxDays: 90, cash: 0.1, parcel: 0.03, maxInstallments: 6 },
      { label: "91–180 dias", maxDays: 180, cash: 0.25, parcel: 0.1, maxInstallments: 12 },
      { label: "181–360 dias", maxDays: 360, cash: 0.4, parcel: 0.2, maxInstallments: 18 },
      { label: "Acima de 360 dias", maxDays: 99999, cash: 0.6, parcel: 0.35, maxInstallments: 24 },
    ] as Band[],
  },
  pld: {
    cashLimit: 50_000,
    structuringDays: 10,
    structuringMinOps: 3,
    incomeRatio: 3,
    incomeRatioHigh: 5,
    noIncomeMonthly: 30_000,
    passthroughHours: 48,
    passthroughPct: 0.8,
    passthroughMinCredit: 10_000,
    passthroughMinTotal: 30_000,
    manyPayers: 10,
    roundMin: 5_000,
    roundCount: 5,
    caseMinScore: 20,
    analysisDays: 45,
  },
};

export type Settings = typeof DEFAULTS;

function merge<T>(base: T, over: unknown): T {
  if (over === null || typeof over !== "object" || Array.isArray(base)) return (over ?? base) as T;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over as Record<string, unknown>))
    if (k in out && v !== undefined && v !== null && v !== "") out[k] = merge(out[k], v);
  return out as T;
}

export async function getSettings(orgId: string): Promise<Settings> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
  return merge(DEFAULTS, org?.settings ?? {});
}

// Validação ao salvar: números dentro de faixas seguras
export function validateSettings(s: Settings): string | null {
  const between = (v: number, a: number, b: number) => Number.isFinite(v) && v >= a && v <= b;
  const c = s.cnab400;
  for (const [name, [a, b]] of Object.entries({ nossoNumero: c.nossoNumero, ocorrencia: c.ocorrencia, dataOcorrencia: c.dataOcorrencia, valorPago: c.valorPago }))
    if (!(between(a, 1, 400) && between(b, a, 400))) return `CNAB 400: posição inválida em ${name}.`;
  if (c.dataOcorrencia[1] - c.dataOcorrencia[0] !== 5) return "CNAB 400: a data da ocorrência deve ter 6 posições (DDMMAA).";
  if (!between(s.credit.maxCommitment, 0.05, 1) || !between(s.credit.warnCommitment, 0.01, s.credit.maxCommitment)) return "Crédito: limites de comprometimento inválidos.";
  if (!between(s.credit.rejectScore, 0, s.credit.approveScore) || !between(s.credit.approveScore, 1, 1000)) return "Crédito: faixas de score inválidas.";
  if (!between(s.collection.multa, 0, 0.02)) return "Cobrança: a multa não pode passar de 2% (CDC, art. 52, §1º).";
  if (!between(s.collection.jurosMes, 0, 0.1)) return "Cobrança: juros de mora fora da faixa (0 a 10% a.m.).";
  if (!between(s.collection.floorPct, 0, 1)) return "Cobrança: piso do acordo inválido.";
  let prev = 0;
  for (const b of s.collection.bands) {
    if (!(b.maxDays > prev) || !between(b.cash, 0, 0.95) || !between(b.parcel, 0, b.cash) || !between(b.maxInstallments, 1, 60))
      return `Cobrança: faixa "${b.label}" inválida (dias crescentes; desconto parcelado ≤ à vista).`;
    prev = b.maxDays;
  }
  const p = s.pld;
  if (!between(p.cashLimit, 1_000, 1_000_000)) return "PLD: limite de espécie inválido.";
  if (!between(p.analysisDays, 1, 45)) return "PLD: o prazo de análise não pode passar de 45 dias (Circular 3.978, art. 43).";
  if (!between(p.incomeRatio, 1, p.incomeRatioHigh)) return "PLD: razões de renda inválidas.";
  if (s.pix.key && !/^([^@\s]+@[^@\s]+\.[^@\s]+|\+55\d{10,11}|\d{11}|\d{14}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(s.pix.key))
    return "Pix: chave inválida (use e-mail, +55 telefone, CPF, CNPJ ou chave aleatória).";
  return null;
}
