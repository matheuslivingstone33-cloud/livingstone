"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireSession } from "@/lib/auth";
import { DEFAULTS, getSettings, validateSettings, type Settings, type TaxaRecebimento } from "@/lib/settings";

const fmtTaxas = (t: TaxaRecebimento[]) =>
  t.length ? t.map((x) => `${x.tipo} ${(x.pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% + ${x.fixoCentavos}c (±${x.toleranciaCentavos}c)`).join(", ") : "nenhuma";
import { fail } from "@/lib/errors";

const num = (form: FormData, k: string) => Number(String(form.get(k) ?? "").replace(",", "."));
const pct = (form: FormData, k: string) => num(form, k) / 100;
const pair = (form: FormData, k: string): [number, number] => [num(form, `${k}_ini`), num(form, `${k}_fim`)];

export async function saveSettings(form: FormData) {
  const s = await requireSession(["ADMIN"]);
  const back = "/configuracoes";
  const cur = await getSettings(s.orgId);

  const bands = cur.collection.bands.map((b, i) => ({
    label: String(form.get(`band${i}_label`) ?? b.label).slice(0, 40),
    maxDays: num(form, `band${i}_maxDays`),
    cash: pct(form, `band${i}_cash`),
    parcel: pct(form, `band${i}_parcel`),
    maxInstallments: num(form, `band${i}_maxInstallments`),
  }));

  // Taxas por forma de recebimento: linha com qualquer campo preenchido entra (e é validada); linha toda vazia sai
  const linhasTaxa = Math.min(Math.max(0, Math.trunc(num(form, "tx_n")) || 0), 40);
  const taxas: TaxaRecebimento[] = [];
  for (let i = 0; i < linhasTaxa; i++) {
    const raw = (k: string) => String(form.get(`tx${i}_${k}`) ?? "").trim();
    if (!["tipo", "rotulo", "pct", "fixo", "tol"].some((k) => raw(k))) continue;
    taxas.push({
      tipo: raw("tipo").slice(0, 40),
      rotulo: raw("rotulo").slice(0, 40),
      pct: Math.round(num(form, `tx${i}_pct`) * 100) / 10_000,
      fixoCentavos: Math.round(num(form, `tx${i}_fixo`) * 100),
      toleranciaCentavos: raw("tol") === "" ? 2 : num(form, `tx${i}_tol`),
    });
  }

  const next: Settings = {
    pix: {
      key: String(form.get("pix_key") ?? "").trim().slice(0, 77),
      merchant: String(form.get("pix_merchant") ?? "").trim().slice(0, 25),
      city: String(form.get("pix_city") ?? "").trim().slice(0, 15),
      webhookSecret: cur.pix.webhookSecret,
    },
    cnab400: {
      nossoNumero: pair(form, "cnab_nn"),
      ocorrencia: pair(form, "cnab_oc"),
      dataOcorrencia: pair(form, "cnab_dt"),
      valorPago: pair(form, "cnab_vp"),
      codigosLiquidacao: String(form.get("cnab_codigos") ?? "")
        .split(/[,;\s]+/)
        .filter((c) => /^\d{2}$/.test(c)),
    },
    credit: {
      maxCommitment: pct(form, "cr_max"),
      warnCommitment: pct(form, "cr_warn"),
      approveScore: num(form, "cr_approve"),
      rejectScore: num(form, "cr_reject"),
    },
    collection: {
      multa: pct(form, "co_multa"),
      jurosMes: pct(form, "co_juros"),
      floorPct: pct(form, "co_floor"),
      minInstallment: num(form, "co_min"),
      validityDays: num(form, "co_validade"),
      bands,
    },
    pld: {
      ...cur.pld,
      cashLimit: num(form, "pld_cash"),
      structuringDays: num(form, "pld_frac_dias"),
      structuringMinOps: num(form, "pld_frac_ops"),
      incomeRatio: num(form, "pld_renda"),
      incomeRatioHigh: num(form, "pld_renda_alta"),
      passthroughHours: num(form, "pld_pass_horas"),
      passthroughPct: pct(form, "pld_pass_pct"),
      manyPayers: num(form, "pld_remetentes"),
      caseMinScore: num(form, "pld_score"),
      analysisDays: num(form, "pld_prazo"),
    },
    ai: {
      dailyLimitUsd: num(form, "ai_usd"),
      dailyLimitCalls: num(form, "ai_calls"),
    },
    regua: {
      ativa: form.get("rg_ativa") === "on",
      horaInicio: num(form, "rg_ini"),
      horaFim: num(form, "rg_fim"),
      feriados: form.get("rg_feriados") === "on",
      // Etapa com dias em branco sai da régua (a proposta, dia 0, é obrigatória)
      etapas: DEFAULTS.regua.etapas
        .map((e) => ({ id: e.id, raw: String(form.get(`rg_dias_${e.id}`) ?? "").trim() }))
        .filter((e) => e.id === "proposta" || e.raw !== "")
        .map((e) => ({ id: e.id, dias: e.id === "proposta" ? 0 : Number(e.raw) })),
      minutos: Object.fromEntries(Object.keys(DEFAULTS.regua.minutos).map((k) => [k, num(form, `rg_min_${k}`)])),
      maxPorExecucao: num(form, "rg_max"),
    },
    conciliacao: { ...cur.conciliacao, taxas },
  };
  if (!next.cnab400.codigosLiquidacao.length) fail(back, "CNAB 400: informe ao menos um código de liquidação (ex.: 06).");
  const problem = validateSettings(next);
  if (problem) fail(back, problem);

  await db.organization.update({ where: { id: s.orgId }, data: { settings: next } });
  await audit(
    s,
    "config.salvar",
    `Configurações da instituição atualizadas${cur.ai.dailyLimitUsd !== next.ai.dailyLimitUsd || cur.ai.dailyLimitCalls !== next.ai.dailyLimitCalls ? ` · teto de IA: US$ ${next.ai.dailyLimitUsd}/dia e ${next.ai.dailyLimitCalls} chamadas/dia` : ""}${cur.regua.ativa !== next.regua.ativa ? ` · régua de cobrança ${next.regua.ativa ? "ligada" : "desligada"}` : ""}${JSON.stringify(cur.conciliacao.taxas) !== JSON.stringify(next.conciliacao.taxas) ? ` · taxas de recebimento: ${fmtTaxas(cur.conciliacao.taxas)} → ${fmtTaxas(next.conciliacao.taxas)}` : ""}`.slice(0, 1000),
  );
  revalidatePath("/", "layout");
  redirect(`${back}?salvo=1`);
}

export async function rotateWebhookSecret() {
  const s = await requireSession(["ADMIN"]);
  const cur = await getSettings(s.orgId);
  const secret = randomBytes(24).toString("base64url");
  await db.organization.update({ where: { id: s.orgId }, data: { settings: { ...cur, pix: { ...cur.pix, webhookSecret: secret } } } });
  await audit(s, "config.webhook_segredo", "Novo segredo do webhook Pix gerado");
  revalidatePath("/configuracoes");
  redirect("/configuracoes?webhook=1#pix");
}
