// Decisão humana sobre a análise de crédito. Lógica pura: sem banco, sem Next, sem IA.

export type DecisaoFinal = "APROVADO" | "RECUSADO";
export const DECISOES_FINAIS: DecisaoFinal[] = ["APROVADO", "RECUSADO"];
export const JUSTIFICATIVA_MIN_CREDITO = 30;
const JUSTIFICATIVA_MAX = 2000;

export type ValidacaoDecisao = { ok: true; decisao: DecisaoFinal; justificativa: string; revisao: boolean } | { ok: false; error: string };

export function validarDecisao(input: { atual: string | null | undefined; nova: unknown; justificativa: unknown; role: string }): ValidacaoDecisao {
  const nova = String(input.nova ?? "");
  if (!DECISOES_FINAIS.includes(nova as DecisaoFinal)) return { ok: false, error: "Escolha a decisão: aprovar ou recusar." };
  const justificativa = String(input.justificativa ?? "").trim();
  if (justificativa.length < JUSTIFICATIVA_MIN_CREDITO)
    return { ok: false, error: `A justificativa precisa ter ao menos ${JUSTIFICATIVA_MIN_CREDITO} caracteres (fica registrada para auditoria).` };
  const revisao = !!input.atual;
  if (revisao) {
    if (input.role !== "ADMIN") return { ok: false, error: "A decisão já foi tomada. Só um Administrador pode revisá-la." };
    if (input.atual === nova) return { ok: false, error: "A revisão precisa mudar a decisão atual." };
  }
  return { ok: true, decisao: nova as DecisaoFinal, justificativa: justificativa.slice(0, JUSTIFICATIVA_MAX), revisao };
}

const SUGESTAO_PARA_FINAL: Record<string, DecisaoFinal | undefined> = { APROVAR: "APROVADO", RECUSAR: "RECUSADO" };

/** Compara a sugestão automática com a decisão humana. ANALISAR não sugere um lado: decidir é sempre "Decidido após análise". */
export function rotuloSugestaoXDecisao(decision: string, finalDecision: string | null | undefined) {
  if (!finalDecision) return "Aguardando decisão";
  const esperado = SUGESTAO_PARA_FINAL[decision];
  if (!esperado) return "Decidido após análise";
  return esperado === finalDecision ? "Confirmou sugestão" : "Divergiu da sugestão";
}
