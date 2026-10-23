// Régua de cobrança: regras puras (sem banco, sem Next). O instante "now" vem sempre por parâmetro.
// Envia a proposta (D+0) e lembretes por WhatsApp dentro de uma janela de horário, em dias úteis de Brasília.
import { createHash } from "node:crypto";
import type { Settings } from "./settings-defaults";
import { diaSP, horaSP } from "./tz";

export type ReguaCfg = Settings["regua"];
export type EtapaId = "proposta" | "lembrete" | "ultima";
export type Etapa = { id: EtapaId; dias: number };
export const ETAPAS: EtapaId[] = ["proposta", "lembrete", "ultima"];
export const ETAPA_LABEL: Record<string, string> = { proposta: "Proposta", lembrete: "Lembrete", ultima: "Último lembrete" };

export const MSG_STATUS = ["PROCESSANDO", "ENVIADO", "FALHOU", "IGNORADO", "DESLIGADO"] as const;
export type MsgStatus = (typeof MSG_STATUS)[number];

/** Tentativas máximas de um envio com falha temporária. */
export const MAX_TENTATIVAS = 3;
/** PROCESSANDO há mais que isso: o resultado é incerto e o envio nunca é repetido. */
export const PROCESSANDO_INCERTO_MS = 10 * 60_000;
/** Prefixos do motivo de falha: a temporária pode ser tentada de novo. */
export const FALHA_TEMPORARIA = "falha_temporaria";
export const FALHA_DEFINITIVA = "falha_definitiva";

// DDDs em uso no Brasil (Anatel)
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Celular brasileiro → "55DDDNUMERO" (13 dígitos). Fixo, DDD inválido ou número incompleto → null. */
export function normalizarTelefoneBR(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  else d = d.replace(/^0+/, "");
  if (d.length !== 11) return null;
  if (!DDDS.has(Number(d.slice(0, 2))) || d[2] !== "9") return null;
  return `55${d}`;
}

/** Chave do devedor na instituição, sem guardar o documento: sha256(orgId + documento só com dígitos). */
export const debtorKey = (orgId: string, documento: string) => createHash("sha256").update(`${orgId}:${String(documento).replace(/\D/g, "")}`).digest("hex");

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Feriados nacionais do ano ("AAAA-MM-DD"): datas fixas e a Sexta-feira Santa (Páscoa − 2 dias). */
export function feriadosNacionais(ano: number): Set<string> {
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${ano}-${md}`);
  // Páscoa: algoritmo gregoriano anônimo (Meeus/Jones/Butcher)
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(Date.UTC(ano, mes - 1, dia));
  const sexta = new Date(pascoa.getTime() - 2 * 86_400_000);
  return new Set([...fixos, iso(sexta.getUTCFullYear(), sexta.getUTCMonth() + 1, sexta.getUTCDate())]);
}

/** Dia útil em Brasília (segunda a sexta; com feriados=true, fora dos feriados nacionais). */
export function diaUtilSP(now: Date, feriados = true): boolean {
  const { diaSemana } = horaSP(now);
  if (diaSemana === 0 || diaSemana === 6) return false;
  if (!feriados) return true;
  const dia = diaSP(now);
  return !feriadosNacionais(Number(dia.slice(0, 4))).has(dia);
}

/** Dentro da janela de envio: dia útil em Brasília e horaInicio ≤ hora < horaFim. */
export function dentroDaJanela(now: Date, cfg: Pick<ReguaCfg, "horaInicio" | "horaFim" | "feriados">): boolean {
  if (!diaUtilSP(now, cfg.feriados)) return false;
  const { hora } = horaSP(now);
  return hora >= cfg.horaInicio && hora < cfg.horaFim;
}

/** Dias corridos (calendário de Brasília) entre dois instantes; nunca negativo. */
export function diasCorridosSP(desde: Date, now: Date): number {
  const ms = (x: Date) => {
    const [y, m, d] = diaSP(x).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.max(0, Math.round((ms(now) - ms(desde)) / 86_400_000));
}

export type LinhaEnvio = { etapa: string; status: string; motivo?: string | null; tentativas?: number };

/** A etapa já foi resolvida e não volta à fila: enviada, ignorada, em processamento ou com falha definitiva/esgotada. */
export function etapaConcluida(r: LinhaEnvio): boolean {
  if (r.status === "DESLIGADO") return false;
  if (r.status === "FALHOU") return !(String(r.motivo ?? "").startsWith(FALHA_TEMPORARIA) && (r.tentativas ?? 0) < MAX_TENTATIVAS);
  return true;
}

/** Exceção que pede olhar humano: falha definitiva, envio incerto, tentativas esgotadas ou telefone inválido. */
export const ehExcecao = (r: LinhaEnvio) => (r.status === "FALHOU" && etapaConcluida(r)) || (r.status === "IGNORADO" && r.motivo === "telefone_invalido");

/**
 * Etapa devida hoje para um acordo: só a mais recente já alcançada (dias corridos desde a proposta) e ainda não concluída.
 * As anteriores alcançadas e nunca enviadas voltam em "superadas" (gravadas como IGNORADO "superada"): o devedor não recebe
 * duas mensagens atrasadas em sequência.
 */
export function etapaDevida(agreement: { createdAt: Date }, etapas: Etapa[], concluidas: Iterable<string>, now: Date): { etapa: Etapa | null; superadas: Etapa[] } {
  const feitas = new Set(concluidas);
  const dias = diasCorridosSP(agreement.createdAt, now);
  const alcancadas = [...etapas].sort((a, b) => a.dias - b.dias).filter((e) => e.dias <= dias);
  if (!alcancadas.length) return { etapa: null, superadas: [] };
  const ultima = alcancadas[alcancadas.length - 1];
  const superadas = alcancadas.slice(0, -1).filter((e) => !feitas.has(e.id));
  return { etapa: feitas.has(ultima.id) ? null : ultima, superadas };
}

/** Próxima etapa ainda não concluída e quantos dias faltam (0 = hoje). null quando a régua acabou para este acordo. */
export function proximaEtapa(agreement: { createdAt: Date }, etapas: Etapa[], concluidas: Iterable<string>, now: Date): { etapa: Etapa; emDias: number } | null {
  const { etapa } = etapaDevida(agreement, etapas, concluidas, now);
  if (etapa) return { etapa, emDias: 0 };
  const dias = diasCorridosSP(agreement.createdAt, now);
  const prox = [...etapas].sort((a, b) => a.dias - b.dias).find((e) => e.dias > dias);
  return prox ? { etapa: prox, emDias: prox.dias - dias } : null;
}

export type MotivoPulo =
  | "regua_desligada"
  | "pausado"
  | "opt_out"
  | "fechado"
  | "acordo_nao_proposto"
  | "expirado"
  | "telefone_invalido"
  | "fora_da_janela"
  | "limite_diario"
  | "desligado";

export type ContextoDecisao = {
  cfg: Pick<ReguaCfg, "ativa" | "horaInicio" | "horaFim" | "feriados">;
  debt: { status: string; reguaPausedAt: Date | null; reguaPauseReason: string | null };
  agreement: { status: string; expiresAt: Date };
  telefone: string | null;
  now: Date;
  enviouHoje: boolean;
  temCanal: boolean;
};

/**
 * Decide se a etapa sai agora. Ordem: régua desligada, pausa/opt-out, contrato fechado ou acordo fora de PROPOSTO, expirado,
 * telefone inválido, fora da janela, já recebeu mensagem hoje, sem canal configurado ("desligado").
 * "registrar" diz com que situação a etapa fica gravada; sem ela, só é contada e volta na próxima execução.
 */
export function decidir(ctx: ContextoDecisao): { ok: true } | { ok: false; motivo: MotivoPulo; registrar?: "IGNORADO" | "DESLIGADO" } {
  if (!ctx.cfg.ativa) return { ok: false, motivo: "regua_desligada" };
  if (ctx.debt.reguaPausedAt) return { ok: false, motivo: ctx.debt.reguaPauseReason === "opt_out" ? "opt_out" : "pausado" };
  if (ctx.debt.status === "ACORDO" || ctx.debt.status === "QUITADO") return { ok: false, motivo: "fechado" };
  if (ctx.agreement.status !== "PROPOSTO") return { ok: false, motivo: "acordo_nao_proposto" };
  if (ctx.agreement.expiresAt <= ctx.now) return { ok: false, motivo: "expirado" };
  if (!ctx.telefone) return { ok: false, motivo: "telefone_invalido", registrar: "IGNORADO" };
  if (!dentroDaJanela(ctx.now, ctx.cfg)) return { ok: false, motivo: "fora_da_janela" };
  if (ctx.enviouHoje) return { ok: false, motivo: "limite_diario" };
  if (!ctx.temCanal) return { ok: false, motivo: "desligado", registrar: "DESLIGADO" };
  return { ok: true };
}

export type DadosTexto = { mensagemProposta: string; devedor: string; credor: string; valor: string; link: string; validade: string };

/** Texto da etapa. D+0 usa a mensagem da proposta (já conferida); lembretes são modelos fixos, sem IA. */
export function textoEtapa(etapa: EtapaId | string, d: DadosTexto): string {
  if (etapa === "proposta") return d.mensagemProposta;
  const nome = String(d.devedor).trim().split(/\s+/)[0] || "tudo bem";
  const credor = d.credor || "seu credor";
  if (etapa === "ultima")
    return `Olá, ${nome}. Último lembrete de ${credor}: a proposta de acordo de ${d.valor} vale até ${d.validade}. Para ver as condições e pagar por Pix, acesse ${d.link}\nSe já pagou, desconsidere esta mensagem.`;
  return `Olá, ${nome}. Lembrete de ${credor}: a proposta de acordo de ${d.valor} continua disponível. Para ver as condições e pagar por Pix, acesse ${d.link}\nSe já pagou, desconsidere esta mensagem.`;
}

/** Validação da régua ao salvar as configurações. null quando está tudo certo. */
export function validarRegua(cfg: ReguaCfg, validityDays: number): string | null {
  const int = (v: number) => Number.isInteger(v);
  const e = cfg.etapas;
  if (!Array.isArray(e) || e.length < 1 || e.length > 5) return "Régua: use de 1 a 5 etapas.";
  if (e.some((x) => !int(x.dias) || x.dias < 0)) return "Régua: os dias de cada etapa devem ser números inteiros.";
  if (e[0].dias !== 0) return "Régua: a primeira etapa (proposta) sai no dia 0.";
  for (let i = 1; i < e.length; i++) if (!(e[i].dias > e[i - 1].dias)) return "Régua: os dias das etapas devem ser crescentes.";
  if (e.some((x) => x.dias >= validityDays)) return `Régua: todas as etapas precisam sair antes do fim da validade da proposta (${validityDays} dias).`;
  if (!int(cfg.horaInicio) || !int(cfg.horaFim) || cfg.horaInicio < 8 || cfg.horaFim > 20 || cfg.horaInicio >= cfg.horaFim)
    return "Régua: horário de envio entre 8h e 20h, com início antes do fim.";
  if (!int(cfg.maxPorExecucao) || cfg.maxPorExecucao < 1 || cfg.maxPorExecucao > 500) return "Régua: máximo por execução entre 1 e 500.";
  for (const v of Object.values(cfg.minutos ?? {})) if (!Number.isFinite(v) || v < 0 || v > 60) return "Régua: minutos por item entre 0 e 60.";
  return null;
}
