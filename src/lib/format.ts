import { fmtData, fmtDataHora, fmtDiaCalendario } from "./tz";

export const brl = (v: unknown) =>
  v === null || v === undefined
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Instante (createdAt, expiresAt, decidedAt...) → data e hora em Brasília. */
export const dt = (d: Date | string | null | undefined) => (d ? fmtDataHora(d) : "—");

/** Data de calendário gravada como meia-noite UTC (vencimento, pagamento, período) → dd/mm/aaaa em UTC. */
export const day = (d: Date | string | null | undefined) => (d ? fmtDiaCalendario(d) : "—");

/** Instante → só o dia, em Brasília (ex.: validade de proposta). */
export const dayInst = (d: Date | string | null | undefined) => (d ? fmtData(d) : "—");

/** Moeda em reais para textos gerados (mensagens, dossiês, pareceres). Mesmo formato em todo lugar, para a conferência da IA bater. */
export const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
