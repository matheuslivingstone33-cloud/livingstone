export const brl = (v: unknown) =>
  v === null || v === undefined
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dt = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export const day = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

/** Moeda em reais para textos gerados (mensagens, dossiês, pareceres). Mesmo formato em todo lugar, para a conferência da IA bater. */
export const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
