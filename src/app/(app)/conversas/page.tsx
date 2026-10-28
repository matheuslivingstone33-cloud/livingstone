import Link from "next/link";
import { listarConversas } from "@/app/actions-conversas";
import { Empty, PageTitle, TableCard } from "@/components/ui";
import { fmtDataHora } from "@/lib/tz";

export const dynamic = "force-dynamic";

export default async function ConversasPage({ searchParams }: { searchParams: Promise<{ org?: string | string[] }> }) {
  const org = (await searchParams).org;
  const orgFiltro = typeof org === "string" ? org : undefined;
  const { conversas, instituicoes } = await listarConversas(orgFiltro);
  return (
    <>
      <PageTitle eyebrow="Plataforma" title="Conversas do assistente" subtitle="Perguntas e respostas do assistente por pessoa, com CPF e CNPJ mascarados. Guardadas por 180 dias. Toda leitura fica na auditoria." />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-56">
          <label className="label" htmlFor="f-org">Instituição</label>
          <select className="input" id="f-org" name="org" defaultValue={orgFiltro ?? ""}>
            <option value="">Todas</option>
            {instituicoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn">Filtrar</button>
        <Link className="btn btn-ghost" href="/conversas">
          Limpar
        </Link>
      </form>
      <TableCard title="Conversas" meta={<span className="text-xs text-ink-500">{conversas.length}</span>}>
        {conversas.length === 0 ? (
          <Empty>Nenhuma conversa registrada ainda.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Instituição</th>
                <th>Mensagens</th>
                <th>Custo (US$)</th>
                <th>Última</th>
              </tr>
            </thead>
            <tbody>
              {conversas.map((c) => (
                <tr key={`${c.orgId}:${c.userId}`}>
                  <td className="font-medium text-ink-900">
                    <Link href={`/conversas/${c.userId}`} className="hover:underline">
                      {c.nome}
                    </Link>
                    <span className="block text-xs font-normal text-ink-500">{c.email}</span>
                  </td>
                  <td className="whitespace-nowrap text-ink-700">{c.instituicao}</td>
                  <td className="tabular-nums text-ink-700">{c.total}</td>
                  <td className="tabular-nums text-ink-700">{c.custoUsd.toFixed(4)}</td>
                  <td className="whitespace-nowrap tabular-nums text-ink-500">{fmtDataHora(c.ultima)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </>
  );
}
