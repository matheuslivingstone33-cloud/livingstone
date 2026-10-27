// Configurações por instituição. Valores ausentes caem nos padrões abaixo.
import { db } from "./db";

import { DEFAULTS, type Settings } from "./settings-defaults";
import { validarRegua } from "./regua";
import { validarTaxas } from "./taxa-recebimento";

export { DEFAULTS, type Band, type Settings, type TaxaRecebimento } from "./settings-defaults";

export function merge<T>(base: T, over: unknown): T {
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
  if (!between(s.ai.dailyLimitUsd, 0, 1000) || !between(s.ai.dailyLimitCalls, 0, 10_000) || !Number.isInteger(s.ai.dailyLimitCalls))
    return "IA: teto diário inválido (0 a 1000 USD e 0 a 10000 chamadas; 0 desliga a IA).";
  if (s.pix.key && !/^([^@\s]+@[^@\s]+\.[^@\s]+|\+55\d{10,11}|\d{11}|\d{14}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(s.pix.key))
    return "Pix: chave inválida (use e-mail, +55 telefone, CPF, CNPJ ou chave aleatória).";
  const regua = validarRegua(s.regua, s.collection.validityDays);
  if (regua) return regua;
  const taxas = validarTaxas(s.conciliacao.taxas);
  if (taxas) return taxas;
  return null;
}
