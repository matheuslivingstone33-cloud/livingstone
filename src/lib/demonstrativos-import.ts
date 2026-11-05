// Gravação do P&L mensal do QuickBooks já lido (tela do Consolidado ou plano confirmado no assistente).
// Mesmo comportamento da importação original: rascunho novo ou atualizado, mês conferido recusado, contas novas com o padrão.
import { db } from "@/lib/db";
import { audit, type Session } from "@/lib/auth";
import { flagDe, mapearQuickbooks, padroesQuickbooks, type ArvoreContas } from "@/lib/plano-contas";
import { mensagemMesConferido } from "@/lib/consolidado";
import type { PlQuickbooks } from "@/lib/quickbooks-pl";

export type ResultadoGravacao = { ok: true; id: string } | { ok: false; erro: string };

export async function gravarDemonstrativo(s: Session, r: PlQuickbooks, hash: string, opts: { viaAssistente?: boolean } = {}): Promise<ResultadoGravacao> {
  const arvore: ArvoreContas = { moeda: r.moeda, contas: r.contas, secoes: r.secoes, resumo: r.resumo };
  const { linhas, inferidas, alertas } = mapearQuickbooks(arvore);
  const dados = {
    moeda: r.moeda,
    origem: "quickbooks_pl",
    empresa: r.empresa.slice(0, 200) || null,
    linhas,
    contas: arvore,
    inferidas,
    alertas,
    arquivoHash: hash,
    criadoPor: s.userId,
    aceiteAlertas: false,
  };

  const atual = await db.demonstrativoPeriodo.findFirst({ where: { orgId: s.orgId, ano: r.ano, mes: r.mes }, select: { id: true, status: true } });
  const conferido = mensagemMesConferido(r.ano, r.mes);
  if (atual?.status === "CONFERIDO") return { ok: false, erro: conferido };
  let id: string;
  if (atual) {
    const up = await db.demonstrativoPeriodo.updateMany({ where: { id: atual.id, orgId: s.orgId, status: "RASCUNHO" }, data: dados });
    if (up.count !== 1) return { ok: false, erro: conferido };
    id = atual.id;
  } else {
    try {
      id = (await db.demonstrativoPeriodo.create({ data: { ...dados, orgId: s.orgId, ano: r.ano, mes: r.mes }, select: { id: true } })).id;
    } catch {
      return { ok: false, erro: "Outro envio do mesmo mês chegou ao mesmo tempo. Atualize a página e tente de novo." };
    }
  }

  // Contas novas entram com o padrão do QuickBooks; as já classificadas pela org não mudam.
  const padrao = padroesQuickbooks(arvore);
  await db.classificacaoConta.createMany({
    data: arvore.contas.filter((c) => c.secao !== "income").map((c) => ({ orgId: s.orgId, conta: c.caminho, classe: padrao[c.caminho] ?? "nao_classificada", atencao: flagDe(c.nome), updatedBy: s.userId })),
    skipDuplicates: true,
  });

  await audit(s, "demonstrativo.importado", `${String(r.mes).padStart(2, "0")}/${r.ano} · ${arvore.contas.length} contas${opts.viaAssistente ? " · via assistente" : ""}`);
  return { ok: true, id };
}
