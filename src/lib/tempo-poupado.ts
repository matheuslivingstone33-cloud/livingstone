// Tempo poupado pela régua: ESTIMATIVA de minutos que uma pessoa gastaria em cada envio feito à mão. Puro.
// Só conta o que foi de fato enviado (ENVIADO). Os minutos por item podem ser ajustados em settings.regua.minutos.
export const MINUTOS_PADRAO = { proposta: 6, lembrete: 2, ultima: 2 } as const;

export type GrupoEnvio = { etapa: string; status: string; count: number };

export function calcularTempoPoupado(grupos: GrupoEnvio[], minutos: Partial<Record<string, number>> = {}) {
  const tabela: Record<string, number> = { ...MINUTOS_PADRAO, ...minutos };
  let itens = 0;
  let total = 0;
  for (const g of grupos) {
    if (g.status !== "ENVIADO") continue;
    itens += g.count;
    total += g.count * (tabela[g.etapa] ?? 0);
  }
  return { itens, minutos: total, horas: Math.round((total / 60) * 10) / 10 };
}
