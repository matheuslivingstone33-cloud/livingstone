// PLD/FT: regras de monitoramento baseadas na Circular BCB 3.978/2020 e na Carta Circular 4.001/2020.
import { aiMeta, pickAi, type AiCall, type AiUsage } from "./ai";
import { untrusted } from "./ai-prompt";
import { checkDossier } from "./ai-guard";
import type { AiStatus } from "./ai-guard";
import { DEFAULTS, type Settings } from "./settings-defaults";
import { fmtDiaCalendario } from "./tz";
import { buildIndex, nameKey, type ListEntry, type ListIndex } from "./lists";

export type Tx = {
  date: Date;
  clientDoc: string;
  clientName: string;
  income?: number;
  pep: boolean;
  type: string;
  direction: "C" | "D";
  amount: number;
  counterparty?: string;
  counterDoc?: string;
};

export type Evidence = { date: string; type: string; amount: number; counterparty?: string };
export type Alert = {
  rule: string;
  title: string;
  weight: number;
  description: string;
  reference: string;
  evidence: Evidence[];
};

export const CASH_LIMIT = DEFAULTS.pld.cashLimit; // comunicação obrigatória de espécie (Circ. 3.978, art. 49)
const DAY = 86_400_000;

// Lista interna FICTÍCIA: só o tour e os testes a passam explicitamente. Nunca é padrão: em produção valem
// apenas as listas importadas pela instituição (CSNU, OFAC, PEP, interna) em Configurações.
export const DEMO_LIST: ListEntry[] = [
  { source: "INTERNA", name: "Construtora Horizonte Azul", nameKey: nameKey("Construtora Horizonte Azul"), document: "99888777000166", reason: "Empresa citada em operação policial (lista interna fictícia)" },
];

/** Padrão de analyzeClient: nenhuma lista. */
const SEM_LISTAS: ListIndex = buildIndex([]);

const CREDIT_TYPES = ["PIX_RECEBIDO", "TED_RECEBIDA", "DEPOSITO_ESPECIE", "SALARIO", "DEPOSITO"];
const CASH_TYPES = ["DEPOSITO_ESPECIE", "SAQUE_ESPECIE"];
export const TYPE_LABEL: Record<string, string> = {
  PIX_RECEBIDO: "Pix recebido",
  PIX_ENVIADO: "Pix enviado",
  TED_RECEBIDA: "TED recebida",
  TED_ENVIADA: "TED enviada",
  DEPOSITO_ESPECIE: "Depósito em espécie",
  SAQUE_ESPECIE: "Saque em espécie",
  SALARIO: "Salário",
  BOLETO_PAGO: "Boleto pago",
  DEPOSITO: "Depósito",
};

const digits = (s: string) => s.replace(/\D/g, "");
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ev = (t: Tx): Evidence => ({
  date: t.date.toISOString().slice(0, 10),
  type: t.type,
  amount: t.amount,
  counterparty: t.counterparty,
});

export function parseTransactionsCsv(text: string): Tx[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = lines[0]?.includes(";") ? ";" : ",";
  const keys = (lines[0] ?? "")
    .split(sep)
    .map((h) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, ""));
  const money = (s = "") => (s.includes(",") ? Number(s.replace(/[R$\s.]/g, "").replace(",", ".")) : Number(s));
  return lines.slice(1).flatMap((l) => {
    const c = Object.fromEntries(l.split(sep).map((v, i) => [keys[i], v.trim().replace(/^"|"$/g, "")]));
    const m = (c.data ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (!m) return [];
    const type = (c.tipo ?? "").toUpperCase().replace(/\s+/g, "_");
    const tx: Tx = {
      date: new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 12), +(m[5] ?? 0))),
      clientDoc: c.cpfcnpj || c.documento || "",
      clientName: c.cliente || c.nome || "",
      income: c.rendamensal ? money(c.rendamensal) : undefined,
      pep: /^(s|sim|1|true)$/i.test(c.pep ?? ""),
      type,
      direction: CREDIT_TYPES.includes(type) ? "C" : "D",
      amount: Math.abs(money(c.valor)),
      counterparty: c.contraparte || undefined,
      counterDoc: c.doccontraparte || c.documentocontraparte || undefined,
    };
    return tx.clientDoc && tx.amount > 0 ? [tx] : [];
  });
}

export type PldCfg = Settings["pld"];

export function analyzeClient(txs: Tx[], cfg: PldCfg = DEFAULTS.pld, lists: ListIndex = SEM_LISTAS): Alert[] {
  const CASH_LIMIT = cfg.cashLimit;
  const alerts: Alert[] = [];
  const sorted = [...txs].sort((a, b) => a.date.getTime() - b.date.getTime());
  const { income } = sorted[0];
  // PEP: marcado no cadastro OU encontrado na lista de PEP da CGU importada
  const pepHit = lists.match(sorted[0].clientDoc, sorted[0].clientName);
  const pep = sorted[0].pep || pepHit?.source === "PEP";
  // O próprio cliente em lista de sanções é o caso mais grave
  const selfHit = pepHit && pepHit.source !== "PEP" ? pepHit : undefined;
  const credits = sorted.filter((t) => t.direction === "C");
  const cash = sorted.filter((t) => CASH_TYPES.includes(t.type));

  // 1. Espécie igual ou acima de R$ 50 mil: comunicação obrigatória
  const bigCash = cash.filter((t) => t.amount >= CASH_LIMIT);
  if (bigCash.length)
    alerts.push({
      rule: "ESPECIE_50K",
      title: `Operação em espécie ≥ ${fmt(CASH_LIMIT)}`,
      weight: 40,
      description: `${bigCash.length} operação(ões) em espécie somando ${fmt(bigCash.reduce((a, t) => a + t.amount, 0))}. Comunicação ao COAF obrigatória, independentemente de análise.`,
      reference: "Circular BCB 3.978/2020, art. 49",
      evidence: bigCash.map(ev),
    });

  // 2. Fracionamento: várias operações em espécie abaixo do limite que, somadas, o superam (janela de 10 dias)
  const small = cash.filter((t) => t.amount < CASH_LIMIT);
  let bestWindow: Tx[] = [];
  for (let i = 0; i < small.length; i++) {
    const w = small.filter((t) => t.date >= small[i].date && t.date.getTime() - small[i].date.getTime() <= cfg.structuringDays * DAY);
    if (w.reduce((a, t) => a + t.amount, 0) > bestWindow.reduce((a, t) => a + t.amount, 0)) bestWindow = w;
  }
  const windowSum = bestWindow.reduce((a, t) => a + t.amount, 0);
  if (bestWindow.length >= cfg.structuringMinOps && windowSum >= CASH_LIMIT)
    alerts.push({
      rule: "FRACIONAMENTO",
      title: "Fracionamento de operações em espécie",
      weight: 35,
      description: `${bestWindow.length} operações em espécie, todas abaixo de ${fmt(CASH_LIMIT)}, somando ${fmt(windowSum)} em até ${cfg.structuringDays} dias. Padrão típico de quem tenta evitar o limite de comunicação.`,
      reference: "Carta Circular BCB 4.001/2020, art. 1º, I, a",
      evidence: bestWindow.map(ev),
    });

  // 3. Movimentação incompatível com a renda declarada (maior volume mensal de créditos)
  const byMonth = new Map<string, number>();
  for (const t of credits) {
    const k = t.date.toISOString().slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + t.amount);
  }
  const [peakMonth, peak] = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  if (income && peak > income * cfg.incomeRatio) {
    const ratio = peak / income;
    alerts.push({
      rule: "INCOMPATIVEL_RENDA",
      title: "Movimentação incompatível com a renda",
      weight: ratio > cfg.incomeRatioHigh ? 30 : 20,
      description: `Créditos de ${fmt(peak)} em ${peakMonth.split("-").reverse().join("/")}, ${ratio.toFixed(1)}x a renda mensal declarada de ${fmt(income)}.`,
      reference: "Carta Circular BCB 4.001/2020, art. 1º, II, a",
      evidence: credits
        .filter((t) => t.date.toISOString().startsWith(peakMonth))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8)
        .map(ev),
    });
  } else if (!income && peak > cfg.noIncomeMonthly)
    alerts.push({
      rule: "RENDA_NAO_INFORMADA",
      title: "Renda/faturamento não informado",
      weight: 15,
      description: `Créditos de ${fmt(peak)} em um mês sem renda ou faturamento cadastrado. Atualizar cadastro (KYC).`,
      reference: "Circular BCB 3.978/2020, arts. 18 a 20",
      evidence: [],
    });

  // 4. Passagem rápida: créditos relevantes que saem quase integralmente em até 48 horas
  const passthrough: Tx[] = [];
  let passAmount = 0;
  let passMoved = 0;
  const debits = sorted.filter((t) => t.direction === "D").map((t) => ({ t, left: t.amount }));
  for (const c of credits.filter((t) => t.amount >= cfg.passthroughMinCredit)) {
    const win = debits.filter(
      (d) => d.left > 0 && d.t.date >= c.date && d.t.date.getTime() - c.date.getTime() <= cfg.passthroughHours * 3_600_000,
    );
    let need = c.amount;
    const take: [(typeof debits)[number], number][] = [];
    for (const d of win) {
      if (need <= 0) break;
      const x = Math.min(d.left, need);
      take.push([d, x]);
      need -= x;
    }
    const moved = c.amount - need;
    // Só consome os débitos se justificarem a saída do crédito; senão ficam livres para o próximo
    if (moved >= c.amount * cfg.passthroughPct) {
      for (const [d, x] of take) d.left -= x;
      passthrough.push(c, ...take.map(([d]) => d.t).filter((o) => !passthrough.includes(o)));
      passAmount += c.amount;
      passMoved += moved;
    }
  }
  const passCredits = passthrough.filter((t) => t.direction === "C").length;
  if (passCredits >= 2 || passAmount >= cfg.passthroughMinTotal)
    alerts.push({
      rule: "PASSAGEM_RAPIDA",
      title: "Conta de passagem (entrada e saída rápida)",
      weight: 25,
      description: `${passCredits} crédito(s) somando ${fmt(passAmount)}, dos quais ${fmt(passMoved)} foram transferidos em até ${cfg.passthroughHours} horas (≥ ${Math.round(cfg.passthroughPct * 100)}% do valor), sem permanência na conta.`,
      reference: "Carta Circular BCB 4.001/2020, art. 1º, II, d",
      evidence: passthrough.slice(0, 12).map(ev),
    });

  // 5. Muitos depositantes distintos (possível conta "laranja" ou arrecadação de terceiros)
  const payers = new Set(credits.filter((t) => t.type !== "SALARIO").map((t) => t.counterDoc || t.counterparty).filter(Boolean));
  const thirdParty = credits.filter((t) => t.type !== "SALARIO").reduce((a, t) => a + t.amount, 0);
  if (payers.size >= cfg.manyPayers && (!income || thirdParty > income * cfg.incomeRatio))
    alerts.push({
      rule: "MULTIPLOS_DEPOSITANTES",
      title: "Recebimentos de muitos remetentes distintos",
      weight: 20,
      description: `${payers.size} remetentes diferentes enviaram ${fmt(thirdParty)} no período, sem atividade econômica que justifique.`,
      reference: "Carta Circular BCB 4.001/2020, art. 1º, II, c",
      evidence: credits.filter((t) => t.type !== "SALARIO").slice(0, 12).map(ev),
    });

  // 6. Valores redondos repetidos
  const round = sorted.filter((t) => t.amount >= cfg.roundMin && t.amount % 1_000 === 0);
  if (round.length >= cfg.roundCount)
    alerts.push({
      rule: "VALORES_REDONDOS",
      title: "Repetição de valores redondos",
      weight: 10,
      description: `${round.length} operações com valores exatos em milhares (≥ ${fmt(cfg.roundMin)}).`,
      reference: "Carta Circular BCB 4.001/2020, art. 1º, II",
      evidence: round.slice(0, 10).map(ev),
    });

  // 7. Contraparte em lista restritiva
  if (selfHit)
    alerts.push({
      rule: "CLIENTE_LISTA_RESTRITIVA",
      title: "Cliente em lista de sanções",
      weight: 60,
      description: `${sorted[0].clientName} consta em ${selfHit.source}: ${selfHit.reason ?? selfHit.name}. Indisponibilidade de ativos e comunicação imediata podem ser exigidas.`,
      reference: "Lei 13.810/2019 e Resolução BCB 44/2020",
      evidence: [],
    });
  const hitOf = (t: Tx) => {
    const h = lists.match(t.counterDoc, t.counterparty);
    return h && h.source !== "PEP" ? h : undefined;
  };
  const hits = sorted.filter((t) => hitOf(t));
  if (hits.length)
    alerts.push({
      rule: "LISTA_RESTRITIVA",
      title: "Contraparte em lista restritiva",
      weight: 40,
      description: [...new Set(hits.map((t) => `${t.counterparty ?? t.counterDoc}: ${hitOf(t)!.source} — ${hitOf(t)!.reason ?? ""}`))].join("; "),
      reference: "Lei 13.810/2019 e Circular BCB 3.978/2020, art. 34",
      evidence: hits.map(ev),
    });

  // 8. Pessoa exposta politicamente: agrava o risco quando há outros alertas
  if (pep && alerts.length)
    alerts.push({
      rule: "PEP",
      title: "Pessoa exposta politicamente (PEP)",
      weight: 15,
      description: `Cliente PEP${pepHit?.source === "PEP" ? ` (lista da CGU: ${pepHit.reason})` : ""} com operações atípicas. Exige diligência reforçada e aprovação de nível hierárquico superior.`,
      reference: "Circular BCB 3.978/2020, art. 27",
      evidence: [],
    });

  // 9. Mesmo nome de entrada sem documento numa lista de sanções, mas o cliente/contraparte tem documento:
  // não é match confirmado (pode ser homônimo), fica como alerta leve para o analista conferir.
  const homonymOf = (doc: string | undefined, name: string | undefined) => {
    const h = lists.possibleHomonym(doc, name);
    return h && h.source !== "PEP" ? h : undefined;
  };
  const homonyms = [
    ...(selfHit ? [] : [homonymOf(sorted[0].clientDoc, sorted[0].clientName)].filter(Boolean).map((h) => `${sorted[0].clientName}: ${h!.source} — ${h!.reason ?? h!.name}`)),
    ...sorted.filter((t) => !hitOf(t) && homonymOf(t.counterDoc, t.counterparty)).map((t) => `${t.counterparty}: ${homonymOf(t.counterDoc, t.counterparty)!.source} — ${homonymOf(t.counterDoc, t.counterparty)!.reason ?? ""}`),
  ];
  const homonymTxs = sorted.filter((t) => !hitOf(t) && homonymOf(t.counterDoc, t.counterparty));
  if (homonyms.length)
    alerts.push({
      rule: "POSSIVEL_HOMONIMO",
      title: "Possível homônimo em lista — conferir documento",
      weight: 10,
      description: `Nome igual a entrada sem documento em lista restritiva: ${[...new Set(homonyms)].join("; ")}. Confirme pelo documento antes de tratar como match.`,
      reference: "Lei 13.810/2019 e Circular BCB 3.978/2020, art. 34",
      evidence: homonymTxs.map(ev),
    });

  return alerts;
}

export function scoreOf(alerts: Alert[]) {
  const score = Math.min(100, alerts.reduce((a, x) => a + x.weight, 0));
  return { score, risk: score >= 60 ? "ALTO" : score >= 30 ? "MEDIO" : "BAIXO" };
}

export function groupByClient(txs: Tx[]) {
  const map = new Map<string, Tx[]>();
  for (const t of txs) {
    const k = digits(t.clientDoc);
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  return map;
}

// ---- Dossiê para comunicação ao COAF (SISCOAF) ----

export type CaseInfo = {
  clientName: string;
  clientDoc: string;
  declaredIncome?: number | null;
  pep: boolean;
  periodStart: Date;
  periodEnd: Date;
  totalIn: number;
  totalOut: number;
  alerts: Alert[];
  score: number;
};

export type DossierResult = { text: string; base: string; aiText?: string; provider: string; aiStatus: AiStatus; aiDetail?: string; usage?: AiUsage; model?: string; usageId?: string };

export async function buildDossier(c: CaseInfo, opts: { useAi?: boolean; call?: AiCall } = {}): Promise<DossierResult> {
  // Período do lote é data de calendário (meia-noite UTC); a conferência da IA compara com este mesmo texto
  const d = (x: Date) => fmtDiaCalendario(x);
  const base = [
    `DOSSIÊ DE ANÁLISE PLD/FT`,
    ``,
    `1. IDENTIFICAÇÃO`,
    `Cliente: ${c.clientName} — ${c.clientDoc.replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF"} ${c.clientDoc}`,
    `Renda/faturamento mensal declarado: ${c.declaredIncome ? fmt(c.declaredIncome) : "não informado"}`,
    `Pessoa exposta politicamente: ${c.pep ? "SIM" : "não"}`,
    ``,
    `2. PERÍODO E MOVIMENTAÇÃO`,
    `Período analisado: ${d(c.periodStart)} a ${d(c.periodEnd)}`,
    `Total de créditos: ${fmt(c.totalIn)} · Total de débitos: ${fmt(c.totalOut)}`,
    `Pontuação de risco: ${c.score}/100`,
    ``,
    `3. OCORRÊNCIAS IDENTIFICADAS`,
    ...c.alerts.flatMap((a, i) => [
      `3.${i + 1} ${a.title} (${a.reference})`,
      `    ${a.description}`,
      ...a.evidence.slice(0, 6).map((e) => `    - ${e.date.split("-").reverse().join("/")} · ${TYPE_LABEL[e.type] ?? e.type} · ${fmt(e.amount)}${e.counterparty ? ` · ${e.counterparty}` : ""}`),
    ]),
    ``,
    `4. ENQUADRAMENTO`,
    `As situações acima correspondem a indícios previstos na Carta Circular BCB 4.001/2020, podendo configurar ocultação ou dissimulação de recursos (Lei 9.613/1998). Cabe ao analista confirmar se há fundamento econômico ou justificativa documentada antes da decisão.`,
    ``,
    `5. RECOMENDAÇÃO DO SISTEMA`,
    c.alerts.some((a) => a.rule === "ESPECIE_50K")
      ? `Comunicação obrigatória (operação em espécie ≥ R$ 50 mil). Avaliar adicionalmente comunicação de operação suspeita.`
      : c.score >= 60
        ? `Indícios relevantes: recomenda-se comunicar ao COAF, salvo justificativa documentada.`
        : `Indícios moderados: recomenda-se diligência adicional (contato com o cliente, documentos de origem dos recursos) antes da decisão.`,
  ].join("\n");

  const call = opts.useAi === false ? undefined : pickAi(opts.call);
  if (!call) return { text: base, base, provider: "demo", aiStatus: "desligada" };
  const r = await call<{ text: string }>(
    "Você é especialista em PLD/FT de instituição financeira brasileira. Redija dossiês objetivos, técnicos e factuais, sem juízo de culpa, adequados para fundamentar comunicação ao COAF. Não invente fatos além dos fornecidos.",
    `Reescreva o dossiê abaixo em linguagem técnica e clara, mantendo todos os fatos, valores, datas e referências normativas exatamente como estão escritos. Inclua na seção 4 a análise de como as ocorrências se relacionam entre si. Não acrescente fatos, valores, datas, números, documentos, normas nem negações que não estejam no dossiê. Retorne JSON {"text": string}.\n\n${untrusted("dossie_base", base)}`,
    [],
    { task: "pld", validate: (x): x is { text: string } => !!x && typeof (x as { text?: unknown }).text === "string" },
  );
  const meta = aiMeta(r);
  if (!r.ok && r.reason === "limite") return { text: base, base, provider: "demo", aiStatus: "bloqueada_limite", aiDetail: r.detail.slice(0, 300), ...meta };
  if (!r.ok) return { text: base, base, provider: "claude", aiStatus: "falhou", aiDetail: `${r.reason}: ${r.detail}`.slice(0, 300), ...meta };
  const check = checkDossier(r.data.text, base);
  if (!check.ok) return { text: base, base, provider: "claude", aiStatus: "rejeitada", aiDetail: `Faltou: ${check.missing.join("; ")}`.slice(0, 300), ...meta };
  return { text: r.data.text, base, aiText: r.data.text, provider: "claude", aiStatus: "usada", ...meta };
}

// IA no dossiê: no máximo uma tentativa por caso a cada 24h (custo e consistência); o ADMIN pode forçar.
export const DOSSIER_AI_WINDOW_MS = 24 * 3_600_000;
export const dossierAiAvailableAt = (last: Date | null | undefined) => (last ? new Date(last.getTime() + DOSSIER_AI_WINDOW_MS) : null);
