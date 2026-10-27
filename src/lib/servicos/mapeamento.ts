// Sugestão do layout de colunas de uma planilha de conciliação: heurística primeiro, IA só quando há dúvida.
// A IA recebe só o cabeçalho e uma amostra mascarada (dígitos → 9, letras → a); nunca decide sozinha:
// a sugestão dela passa por validateLayout e o usuário confirma na tela antes de salvar.
import type { AiCall, AiResult } from "@/lib/ai";
import { aiCallFor, markUsageRejected } from "@/lib/ai-meter";
import { assinaturaDocumento, dicasDeColunas } from "@/lib/biblioteca";
import { db } from "@/lib/db";
import { isLayoutShape, type AiStatus } from "@/lib/ai-guard";
import { untrusted } from "@/lib/ai-prompt";
import { FORMATOS_DATA, guessLayout, headerOf, sampleForAi, validateLayout, type Layout, type Sugestao, type Tabela, type TipoLayout } from "@/lib/layout-conciliacao";

export type SugestaoLayout = {
  sugestao: Sugestao;
  /** Layout completo e válido, se a heurística ou a IA chegaram a um. */
  layout?: Layout;
  origem: "ia" | "heuristica";
  status: AiStatus;
  usageId?: string;
  motivo?: string;
};

const SISTEMA =
  "Você identifica as colunas de uma planilha financeira, brasileira ou em inglês no formato dos EUA (títulos a receber ou extrato bancário). Os valores da amostra estão mascarados: dígitos viram 9 e letras viram a; use só os nomes das colunas e a forma dos valores.";

type Resposta = { colunas: Record<string, string>; formatoData: string; formatoValor: string };

const completo = (tipo: TipoLayout, header: string[], t: Tabela, linha: number, s: Pick<Sugestao, "layout" | "formatoData" | "formatoValor">) => {
  const v = validateLayout(
    { tipo, colunas: s.layout, formatoData: s.formatoData, formatoValor: s.formatoValor, linhaCabecalho: linha, ...(t.separador ? { separador: t.separador } : {}) },
    header,
  );
  return v.ok ? v.layout : undefined;
};

/** Sugestão pura (testável): `call` é a função de IA; sem ela, só a heurística. */
export async function sugerirLayout(tipo: TipoLayout, t: Tabela, linhaCabecalho: number, opts: { call?: AiCall; dicas?: string[] } = {}): Promise<SugestaoLayout> {
  const header = headerOf(t.linhas, linhaCabecalho);
  const sugestao = guessLayout(tipo, header, t, linhaCabecalho);
  const heur = completo(tipo, header, t, linhaCabecalho, sugestao);
  if (sugestao.confianca === "alta" && heur) return { sugestao, layout: heur, origem: "heuristica", status: "desligada", motivo: "Colunas reconhecidas pelos nomes" };
  // Sem certeza: os campos duvidosos ficam vazios para o usuário escolher
  const base: SugestaoLayout = { sugestao, layout: undefined, origem: "heuristica", status: "desligada", motivo: "IA indisponível" };
  if (!opts.call) return base;
  const amostra = sampleForAi(t, linhaCabecalho, 5);
  let r: AiResult<Resposta>;
  try {
    r = await opts.call<Resposta>(
      SISTEMA,
      `Arquivo de ${tipo === "esperados" ? "títulos esperados (a receber)" : "extrato bancário"}.
Escolha, entre os nomes exatos do cabeçalho, a coluna de cada campo: referencia (identificador do título; obrigatório), valor (obrigatório), data, pagador${tipo === "extrato" ? ", descricao, sinal (coluna D/C de débito ou crédito, se existir)" : ", forma (forma de recebimento do título, como cartão de crédito, débito, Pix ou boleto, se existir)"}. Omita o campo que não existir.
formatoData: um de ${FORMATOS_DATA.join(", ")} ("mmm dd, aaaa" = Oct 27, 2026; "dd-mmm-aaaa" = 27-Oct-2026; meses em inglês). formatoValor: "br" (1.234,56, vírgula decimal), "ponto" (1234.56, ponto decimal sem milhar) ou "us" (1,234.56, formato dos EUA, com $ ou US$ opcional).
Não informe moeda nem cotação: isso é escolha do usuário.
Retorne JSON {"colunas": {"referencia": string, "valor": string, ...}, "formatoData": string, "formatoValor": string}.

${untrusted("planilha_mascarada", JSON.stringify(amostra), 20_000)}${
        opts.dicas?.length ? `

Significado das colunas confirmado pela instituição (use como pista; a escolha continua sendo entre os nomes do cabeçalho):
${untrusted("descricoes_colunas", opts.dicas.slice(0, 50).join("\n"), 8_000)}` : ""
      }`,
      [],
      { task: "mapeamento", validate: isLayoutShape },
    );
  } catch (e) {
    r = { ok: false, reason: "http", detail: String((e as Error)?.message ?? e) };
  }
  if (!r.ok) return { ...base, status: r.reason === "limite" ? "bloqueada_limite" : "falhou", usageId: r.usageId, motivo: `${r.reason}: ${r.detail}`.slice(0, 300) };
  const colunas = Object.fromEntries(Object.entries(r.data.colunas).filter(([, v]) => v));
  const v = validateLayout(
    { tipo, colunas, formatoData: r.data.formatoData, formatoValor: r.data.formatoValor, linhaCabecalho, ...(t.separador ? { separador: t.separador } : {}) },
    header,
  );
  if (!v.ok) return { ...base, status: "rejeitada", usageId: r.usageId, motivo: `Sugestão da IA recusada: ${v.erro}` };
  // Dúvida de formato (dd/mm × mm/dd, ponto × vírgula) é do usuário: a IA não decide no lugar dele
  const p = sugestao.perguntas;
  if (p?.data || p?.valor)
    return {
      sugestao: {
        layout: v.layout.colunas,
        formatoData: p.data ? undefined : v.layout.formatoData,
        formatoValor: p.valor ? undefined : v.layout.formatoValor,
        confianca: "baixa",
        motivos: ["Sugerido pela IA; confira antes de confirmar", ...sugestao.motivos],
        perguntas: p,
      },
      layout: undefined,
      origem: "ia",
      status: "usada",
      usageId: r.usageId,
    };
  return {
    sugestao: { layout: v.layout.colunas, formatoData: v.layout.formatoData, formatoValor: v.layout.formatoValor, confianca: "baixa", motivos: ["Sugerido pela IA; confira antes de confirmar"] },
    layout: v.layout,
    origem: "ia",
    status: "usada",
    usageId: r.usageId,
  };
}

/** Para as actions: IA medida pelo teto da instituição; sugestão recusada marca o consumo como rejeitado. */
export async function sugerirLayoutDaOrg(orgId: string, tipo: TipoLayout, t: Tabela, linhaCabecalho: number): Promise<SugestaoLayout> {
  // Biblioteca: documento confirmado com o mesmo cabeçalho dá o significado das colunas como pista para a IA
  const header = headerOf(t.linhas, linhaCabecalho);
  const doc = await db.documentoBiblioteca.findFirst({ where: { orgId, chave: assinaturaDocumento(header.slice(0, 50)), status: "CONFIRMADO" }, select: { colunas: true } });
  const dicas = doc ? dicasDeColunas(doc.colunas, header) : undefined;
  const r = await sugerirLayout(tipo, t, linhaCabecalho, { call: aiCallFor(orgId), dicas });
  if (r.status === "rejeitada") await markUsageRejected(orgId, r.usageId);
  return r;
}
