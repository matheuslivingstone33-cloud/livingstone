"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireSession } from "@/lib/auth";
import { getSettings, validateSettings, type Settings } from "@/lib/settings";
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
  };
  if (!next.cnab400.codigosLiquidacao.length) fail(back, "CNAB 400: informe ao menos um código de liquidação (ex.: 06).");
  const problem = validateSettings(next);
  if (problem) fail(back, problem);

  await db.organization.update({ where: { id: s.orgId }, data: { settings: next } });
  await audit(
    s,
    "config.salvar",
    `Configurações da instituição atualizadas${cur.ai.dailyLimitUsd !== next.ai.dailyLimitUsd || cur.ai.dailyLimitCalls !== next.ai.dailyLimitCalls ? ` · teto de IA: US$ ${next.ai.dailyLimitUsd}/dia e ${next.ai.dailyLimitCalls} chamadas/dia` : ""}`,
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
