import { salvarClassificacao } from "@/app/actions-demonstrativos";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, CardHeader, Empty, Notice, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { CLASSES, T, isClasse } from "@/lib/consolidado";
import { db } from "@/lib/db";
import type { Classe, Secao } from "@/lib/plano-contas";

const SECAO: Record<Secao, string> = { income: "Receitas", cogs: "Custo do que foi vendido", expense: "Despesas", other_income: "Outras receitas", other_expense: "Outras despesas" };
const pai = (c: string) => (c.split(" > ").length > 2 ? c.slice(0, c.lastIndexOf(" > ")) : null);

export default async function ClassificacaoPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const s = await requireSession();
  const { ok } = await searchParams;
  const canEdit = s.role !== "AUDITOR";
  const rows = await db.classificacaoConta.findMany({ where: { orgId: s.orgId }, orderBy: { conta: "asc" }, select: { conta: true, classe: true, atencao: true } });
  const classe = new Map(rows.map((r) => [r.conta, (isClasse(r.classe) ? r.classe : "nao_classificada") as Classe]));
  // Pendente de verdade: sem classe e sem mãe classificada (a filha herda a classe da mãe).
  const efetiva = (c: string): Classe => {
    const k = classe.get(c) ?? "nao_classificada";
    const p = pai(c);
    return k !== "nao_classificada" || !p ? k : efetiva(p);
  };
  const pendentes = rows.filter((r) => efetiva(r.conta) === "nao_classificada");
  const porSecao = (Object.keys(SECAO) as Secao[]).map((sec) => ({ sec, contas: rows.filter((r) => r.conta.startsWith(`${sec} > `) && efetiva(r.conta) !== "nao_classificada") })).filter((g) => g.contas.length);

  const Seletor = ({ conta }: { conta: string }) => {
    const nomes = conta.split(" > ");
    const herda = classe.get(conta) === "nao_classificada" && efetiva(conta) !== "nao_classificada";
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" style={{ paddingLeft: `${(nomes.length - 2) * 1.25}rem` }}>
        <span className="min-w-0 capitalize text-ink-800">
          {nomes.at(-1)}
          {herda && <span className="ml-2 text-xs normal-case text-ink-500">segue a conta mãe ({T.pt.classe[efetiva(conta)]})</span>}
        </span>
        <select className="input w-48" name={`classe::${conta}`} defaultValue={classe.get(conta)} disabled={!canEdit} aria-label={`Classe de ${nomes.at(-1)}`}>
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {T.pt.classe[c]}
            </option>
          ))}
        </select>
      </li>
    );
  };

  return (
    <>
      <PageTitle
        back={{ href: "/consolidado", label: "Consolidado" }}
        title="Classificar contas"
        subtitle="Diga se cada conta é custo fixo (não muda com as vendas), variável (cresce com as vendas) ou fica fora do cálculo. Vale para todos os meses e é usado no ponto de equilíbrio."
      />
      {ok && <Notice className="mb-6">Classificação salva.</Notice>}
      {rows.length === 0 ? (
        <Empty>Nenhuma conta ainda. Envie o relatório de um mês no Consolidado para as contas aparecerem aqui.</Empty>
      ) : (
        <form action={salvarClassificacao} className="space-y-6">
          {pendentes.length > 0 && (
            <section className="card border-amber-300">
              <CardHeader title="Pendentes">
                <Badge tone="warning">{pendentes.length}</Badge>
              </CardHeader>
              <p className="hint">Enquanto houver conta pendente, o ponto de equilíbrio não é calculado. Classificar a conta mãe resolve as filhas.</p>
              <ul className="divide-y divide-line">
                {pendentes.map((r) => (
                  <Seletor key={r.conta} conta={r.conta} />
                ))}
              </ul>
            </section>
          )}
          {porSecao.map((g) => (
            <section key={g.sec} className="card">
              <CardHeader title={SECAO[g.sec]}>{g.contas.length} contas</CardHeader>
              <ul className="divide-y divide-line">
                {g.contas
                  .map((r) => (
                    <Seletor key={r.conta} conta={r.conta} />
                  ))}
              </ul>
            </section>
          ))}
          {canEdit && <SubmitButton pending="Salvando...">Salvar classificação</SubmitButton>}
        </form>
      )}
    </>
  );
}
