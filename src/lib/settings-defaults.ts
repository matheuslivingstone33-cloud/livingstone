// Padrões de configuração sem acesso ao banco: usados pelas libs puras e pela tela pública.

/** Taxa por forma de recebimento (cartão): tipo comparado com normHeader da coluna forma dos esperados. pct em fração (0,0299 = 2,99%). */
export type TaxaRecebimento = { tipo: string; rotulo: string; pct: number; fixoCentavos: number; toleranciaCentavos: number };

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
  // Teto diário de IA da instituição (dia em Brasília). 0 em qualquer um desliga a IA.
  ai: { dailyLimitUsd: 2, dailyLimitCalls: 300 },
  // Régua de cobrança por WhatsApp: desligada por padrão. Etapas em dias corridos desde a proposta (horário de Brasília).
  // minutos: estimativa do tempo que cada envio levaria à mão (painel "horas poupadas").
  regua: {
    ativa: false,
    horaInicio: 8,
    horaFim: 20,
    feriados: true,
    etapas: [
      { id: "proposta", dias: 0 },
      { id: "lembrete", dias: 3 },
      { id: "ultima", dias: 6 },
    ] as { id: "proposta" | "lembrete" | "ultima"; dias: number }[],
    minutos: { proposta: 6, lembrete: 2, ultima: 2 } as Record<string, number>,
    maxPorExecucao: 100,
  },
  // Taxas de cartão na conciliação: só uma pista no item DIVERGENTE; não muda o status. Vazio por padrão.
  conciliacao: { taxas: [] as TaxaRecebimento[] },
};

export type Settings = typeof DEFAULTS;
