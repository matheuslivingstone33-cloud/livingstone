import Link from "next/link";
import { instituicoesParaFiltro, listarPedidos } from "@/app/actions-pedidos";
import { Badge, Empty, PageTitle, TableCard } from "@/components/ui";
import { ROTULO_STATUS, type StatusPedido } from "@/lib/pedidos";
import { fmtDataHora } from "@/lib/tz";

const TOM: Record<string, "success" | "warning" | "neutral"> = { CONSENSO: "success", AGUARDANDO_CONFIRMACAO: "warning", EM_CONVERSA: "neutral" };

export const dynamic = "force-dynamic";

export default async function PedidosPage({ searchParams }: { searchParams: Promise<{ org?: string | string[] }> }) {
  const org = (await searchParams).org;
  const orgFiltro = typeof org === "string" ? org : undefined;
  const [pedidos, orgs] = await Promise.all([listarPedidos(orgFiltro), instituicoesParaFiltro()]);
  return (
    <>
      <PageTitle eyebrow="Pedidos" title="Pedidos de melhoria" subtitle="Necessidades descritas no assistente, com as versões do entendimento até o consenso. Registro para avaliar; não é compromisso de entrega." />
      {orgs.length > 0 && (
        <form method="get" className="card mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-56">
            <label className="label" htmlFor="f-org">Instituição</label>
            <select className="input" id="f-org" name="org" defaultValue={orgFiltro ?? ""}>
              <option value="">Todas</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn">Filtrar</button>
          <Link className="btn btn-ghost" href="/pedidos">
            Limpar
          </Link>
        </form>
      )}
      <TableCard title="Pedidos" meta={<span className="text-xs text-ink-500">{pedidos.length}</span>}>
        {pedidos.length === 0 ? (
          <Empty>Nenhum pedido registrado ainda.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Situação</th>
                <th>Instituição</th>
                <th>Autor</th>
                <th>Versões</th>
                <th>Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-ink-900">
                    <Link href={`/pedidos/${p.id}`} className="hover:underline">
                      {p.titulo}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={TOM[p.status] ?? "neutral"}>{ROTULO_STATUS[p.status as StatusPedido] ?? p.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap text-ink-700">{p.instituicao}</td>
                  <td className="whitespace-nowrap text-ink-700">{p.autor}</td>
                  <td className="tabular-nums text-ink-700">{p.versoes}</td>
                  <td className="whitespace-nowrap tabular-nums text-ink-500">{fmtDataHora(p.atualizadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </>
  );
}
