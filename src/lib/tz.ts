// Fuso do produto. Regra:
// - INSTANTES (createdAt, expiresAt, decidedAt, dueAt, lastLoginAt, auditoria) são exibidos em America/Sao_Paulo.
// - DATAS DE CALENDÁRIO gravadas como meia-noite UTC (vencimentos, pagamentos, datas de transações)
//   são exibidas em UTC (fmtDiaCalendario); em SP apareceriam um dia antes.
// - Recibos, JSON da API e CSVs exportados continuam em ISO UTC (toISOString), de propósito.
export const TZ = "America/Sao_Paulo";

type D = Date | string | number;
const toDate = (d: D) => (d instanceof Date ? d : new Date(d));

const fDataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
const fData = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const fCal = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
const fParts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Instante → "dd/mm/aaaa hh:mm" no horário de Brasília. */
export const fmtDataHora = (d: D) => fDataHora.format(toDate(d));
/** Instante → dia (dd/mm/aaaa) em Brasília. */
export const fmtData = (d: D) => fData.format(toDate(d));
/** Data de calendário gravada como meia-noite UTC → dd/mm/aaaa. */
export const fmtDiaCalendario = (d: D) => fCal.format(toDate(d));

/** Instante → "AAAA-MM-DD" do dia em Brasília. */
export function diaSP(d: D): string {
  const p = fParts.formatToParts(toDate(d));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** "AAAA-MM-DD" → instante da meia-noite em Brasília. America/Sao_Paulo não tem horário de verão desde 2019: offset fixo -03:00. */
export const inicioDoDiaSP = (iso: string) => new Date(`${iso}T00:00:00-03:00`);

/** Dias corridos entre um vencimento (calendário, meia-noite UTC) e o dia de hoje em Brasília; nunca negativo. */
export function diasEntreSP(vencimentoCalendario: Date, agora: D = new Date()): number {
  const [y, m, d] = diaSP(agora).split("-").map(Number);
  const v = vencimentoCalendario;
  const venc = Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  return Math.max(0, Math.floor((Date.UTC(y, m - 1, d) - venc) / 86_400_000));
}
