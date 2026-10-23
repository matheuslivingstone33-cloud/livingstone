// Rótulos da régua de cobrança para a tela. Puro.
import type { BadgeTone } from "@/components/ui";

const MOTIVO_LABEL: Record<string, string> = {
  superada: "etapa seguinte já estava no prazo",
  telefone_invalido: "telefone inválido (precisa ser celular com DDD)",
  desligado: "WhatsApp não configurado no servidor",
  envio_incerto: "envio interrompido: confira no WhatsApp antes de mandar à mão",
  mudou_status: "contrato mudou durante a execução",
  pausado: "régua pausada",
  opt_out: "devedor pediu para não receber",
  fechado: "contrato fechado",
  expirado: "proposta expirada",
  acordo_nao_proposto: "acordo já aceito ou cancelado",
};

export function motivoLabel(m: string | null | undefined): string {
  if (!m) return "";
  const [tipo, det] = m.split(":");
  if (tipo === "falha_temporaria") return `falha temporária (${det}); nova tentativa na próxima execução`;
  if (tipo === "falha_definitiva") return `falha (${det})`;
  return MOTIVO_LABEL[m] ?? m;
}

export const MSG_LABEL: Record<string, string> = { PROCESSANDO: "Enviando", ENVIADO: "Enviada", FALHOU: "Falhou", IGNORADO: "Não enviada", DESLIGADO: "Envio desligado" };
export const MSG_TONE: Record<string, BadgeTone> = { PROCESSANDO: "info", ENVIADO: "success", FALHOU: "danger", IGNORADO: "neutral", DESLIGADO: "warning" };
