// Resumo do dia do painel. Puro: sem banco, sem Next, sem medidor de IA.
// O texto base é determinístico e sempre existe; a IA só reescreve, e o texto dela é descartado
// se trouxer qualquer número, valor ou data que não esteja no texto base.
import { createHash } from "node:crypto";
import type { AiCall, AiResult } from "./ai";
import { untrusted } from "./ai-prompt";
import { extraFacts, type AiStatus } from "./ai-guard";
import { fmtBRL } from "./format";

/** Prazo de PLD considerado "próximo" (o mesmo "vencendo em 7 dias" da aba PLD). */
export const PLD_PRAZO_PROXIMO_MS = 7 * 86_400_000;
/** Janela dos acordos propostos que vencem em breve. */
export const ACORDO_VENCENDO_MS = 48 * 3_600_000;
/** Janela do valor recuperado. */
export const RECUPERADO_MS = 7 * 86_400_000;
/** Por quanto tempo um resumo da IA salvo continua valendo (se os fatos não mudaram). */
export const RESUMO_VALIDADE_MS = 6 * 3_600_000;
/** Limites do texto da IA. */
export const RESUMO_MAX_CHARS = 400;
export const RESUMO_MAX_FRASES = 3;

export type ResumoFatos = {
  pldPendentes: number;
  pldObrigatorios: number;
  pldVencendo: number;
  acordosVencendo: number;
  conciliacaoProblemas: number;
  /** Em reais, arredondado. */
  dividaAberta: number;
  /** Em reais, arredondado. */
  recuperado7d: number;
};

export type DadosPainel = {
  pldAbertos: { dueAt: Date; mandatory: boolean }[];
  acordosPropostos: { expiresAt: Date }[];
  conciliacaoProblemas: number;
  dividaAberta: number;
  pagamentos: { amount: unknown; paidAt: Date }[];
};

const inteiro = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

/** Fatos do resumo a partir dos dados já carregados do banco. */
export function montarFatos(d: DadosPainel, now: Date): ResumoFatos {
  const t = now.getTime();
  return {
    pldPendentes: d.pldAbertos.length,
    pldObrigatorios: d.pldAbertos.filter((c) => c.mandatory).length,
    pldVencendo: d.pldAbertos.filter((c) => c.dueAt.getTime() - t <= PLD_PRAZO_PROXIMO_MS).length,
    acordosVencendo: d.acordosPropostos.filter((a) => a.expiresAt.getTime() >= t && a.expiresAt.getTime() - t <= ACORDO_VENCENDO_MS).length,
    conciliacaoProblemas: inteiro(d.conciliacaoProblemas),
    dividaAberta: inteiro(d.dividaAberta),
    recuperado7d: inteiro(d.pagamentos.filter((p) => p.paidAt.getTime() <= t && t - p.paidAt.getTime() <= RECUPERADO_MS).reduce((a, p) => a + Number(p.amount), 0)),
  };
}

const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const reais = (n: number) => fmtBRL(n).replace(/ /g, " ");

/** Texto determinístico de 2 a 3 frases. Tudo zerado: frase própria. */
export function resumoBase(f: ResumoFatos): string {
  const zerado = Object.values(f).every((v) => v === 0);
  if (zerado)
    return "Nada pendente por aqui: nenhum caso de PLD em análise, nenhum acordo vencendo e nenhum item a resolver na conciliação. Importe arquivos nos módulos para acompanhar a operação.";
  const pld = f.pldPendentes
    ? `Há ${pl(f.pldPendentes, "caso", "casos")} de PLD em análise, ${f.pldObrigatorios} com comunicação obrigatória e ${f.pldVencendo} com prazo nos próximos 7 dias.`
    : "Nenhum caso de PLD em análise.";
  const pend = `${pl(f.acordosVencendo, "proposta de acordo vence", "propostas de acordo vencem")} nas próximas 48 horas e a conciliação tem ${pl(f.conciliacaoProblemas, "item", "itens")} a resolver.`;
  const din = `A carteira em aberto soma ${reais(f.dividaAberta)} e nos últimos 7 dias entraram ${reais(f.recuperado7d)} de acordos.`;
  return [pld, pend, din].join(" ");
}

/** Impressão digital dos fatos: muda quando qualquer número muda. */
export function fatosHash(f: ResumoFatos): string {
  const k: (keyof ResumoFatos)[] = ["pldPendentes", "pldObrigatorios", "pldVencendo", "acordosVencendo", "conciliacaoProblemas", "dividaAberta", "recuperado7d"];
  return createHash("sha256").update(k.map((x) => `${x}=${f[x]}`).join("|")).digest("hex").slice(0, 32);
}

/** Frases de um texto (fim em . ! ou ? seguido de espaço ou fim). */
export const contarFrases = (s: string) => s.trim().split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length;

/** O resumo salvo ainda vale? Só texto da IA, com os mesmos fatos e gerado há menos de 6 h. */
export function resumoSalvoValido(salvo: { source: string; factsHash: string; generatedAt: Date } | null, hash: string, now: Date): boolean {
  if (!salvo || salvo.source !== "ia" || salvo.factsHash !== hash) return false;
  const idade = now.getTime() - salvo.generatedAt.getTime();
  return idade >= 0 && idade < RESUMO_VALIDADE_MS;
}

export type ResumoGerado = { texto: string; origem: "ia" | "base"; motivo?: string; status: AiStatus; usageId?: string };

const SISTEMA =
  "Você escreve o resumo do dia de um painel de operações financeiras, para quem não é técnico. Português do Brasil, tom direto e calmo, sem alarmismo e sem emojis.";

/** Reescreve o texto base com a IA; qualquer problema devolve o texto base com o motivo. */
export async function gerarResumo(f: ResumoFatos, opts: { call?: AiCall; now: Date }): Promise<ResumoGerado> {
  const base = resumoBase(f);
  // Só a função recebida (na action, a chamada medida pelo teto diário); sem ela, fica o texto base
  const call = opts.call;
  if (!call) return { texto: base, origem: "base", motivo: "IA indisponível", status: "desligada" };
  let r: AiResult<{ texto: string }>;
  try {
    r = await call<{ texto: string }>(
    SISTEMA,
    `Reescreva o resumo abaixo em 1 a 3 frases curtas, com no máximo ${RESUMO_MAX_CHARS} caracteres, destacando primeiro o que pede ação.
Use algarismos para os números. Mantenha exatamente os números e valores do texto e não acrescente nenhum outro número, valor, percentual ou data. Não escreva datas nem dias da semana.
Retorne JSON {"texto": string}.

${untrusted("resumo_base", base)}`,
    [],
    { task: "resumo", validate: (x): x is { texto: string } => !!x && typeof (x as { texto?: unknown }).texto === "string" },
    );
  } catch (e) {
    r = { ok: false, reason: "http", detail: String((e as Error)?.message ?? e) };
  }
  if (!r.ok && r.reason === "limite") return { texto: base, origem: "base", motivo: `limite: ${r.detail}`.slice(0, 300), status: "bloqueada_limite", usageId: r.usageId };
  if (!r.ok) return { texto: base, origem: "base", motivo: `${r.reason}: ${r.detail}`.slice(0, 300), status: "falhou", usageId: r.usageId };
  const texto = r.data.texto.replace(/\s+/g, " ").trim();
  const problemas: string[] = [];
  if (!texto) problemas.push("texto vazio");
  if (texto.length > RESUMO_MAX_CHARS) problemas.push(`texto acima de ${RESUMO_MAX_CHARS} caracteres`);
  const n = contarFrases(texto);
  if (texto && (n < 1 || n > RESUMO_MAX_FRASES)) problemas.push(`${n} frases (máximo ${RESUMO_MAX_FRASES})`);
  problemas.push(...extraFacts(texto, base));
  if (problemas.length) return { texto: base, origem: "base", motivo: problemas.join("; ").slice(0, 300), status: "rejeitada", usageId: r.usageId };
  return { texto, origem: "ia", status: "usada", usageId: r.usageId };
}
