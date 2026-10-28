import Link from "next/link";
import { detalharConversa } from "@/app/actions-conversas";
import { Badge, CardHeader, PageTitle } from "@/components/ui";
import { fmtDataHora } from "@/lib/tz";

export const dynamic = "force-dynamic";

const FIM: Record<string, string> = {
  resposta: "Resposta",
  corte: "Cortada",
  limite: "Teto da instituição",
  falha: "Falha",
  passos: "Passos esgotados",
  custo: "Teto por mensagem",
  plano: "Plano de ação",
  entendimento: "Pedido",
  documento: "Documento",
  sem_ia: "Sem IA",
  recusado: "Recusada",
};
const TOM: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { resposta: "success", sem_ia: "info", plano: "info", entendimento: "info", documento: "info", recusado: "warning", corte: "warning", limite: "danger", falha: "danger" };

export default async function ConversaPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ cursor?: string | string[] }> }) {
  const c = (await searchParams).cursor;
  const cursor = typeof c === "string" && c ? c : undefined;
  const { usuario, mensagens, proximo } = await detalharConversa((await params).userId, cursor);
  return (
    <>
      <PageTitle eyebrow="Conversas" title={usuario.nome} subtitle={`${usuario.email} · ${usuario.instituicao}`} back={{ href: "/conversas", label: "Conversas" }} />
      <section className="card">
        <CardHeader title={`Mensagens (${mensagens.length}${proximo ? "+" : ""})`}>{cursor && <Link href={`/conversas/${usuario.id}`} className="text-sm hover:underline">Voltar ao início</Link>}</CardHeader>
        {mensagens.length === 0 ? (
          <p className="text-sm text-ink-600">Sem mensagens registradas.</p>
        ) : (
          <ol className="space-y-6 text-sm">
            {mensagens.map((m) => (
              <li key={m.id} className="space-y-2">
                <div className="ml-auto max-w-[85%] rounded-xl bg-paper p-3">
                  <p className="text-xs text-ink-500">
                    {usuario.nome} · {fmtDataHora(m.em)}
                    {m.instituicao !== usuario.instituicao ? ` · ${m.instituicao}` : ""}
                  </p>
                  <p className="whitespace-pre-line text-ink-900">{m.pergunta}</p>
                </div>
                <div className="max-w-[85%] rounded-xl border border-line p-3">
                  <p className="text-xs text-ink-500">Assistente</p>
                  <p className="whitespace-pre-line text-ink-800">{m.resposta}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                    <Badge tone={TOM[m.fim] ?? "neutral"}>{FIM[m.fim] ?? m.fim}</Badge>
                    <span>Passos {m.passos}</span>
                    <span>Ferramentas: {m.ferramentas.join(", ") || "nenhuma"}</span>
                    <span className="tabular-nums">US$ {m.custoUsd.toFixed(4)}</span>
                    {m.anexo && (
                      <span>
                        Anexo {m.anexo.formato}
                        {m.anexo.paginas ? ` · ${m.anexo.paginas} pág.` : ""}
                        {m.anexo.bytes ? ` · ${Math.ceil(m.anexo.bytes / 1024)} KB` : ""}
                      </span>
                    )}
                    {m.pedidoId && (
                      <Link href={`/pedidos/${m.pedidoId}`} className="hover:underline">
                        Ver pedido
                      </Link>
                    )}
                    {m.documentoId && (
                      <Link href="/biblioteca" className="hover:underline">
                        Documento {m.documentoId.slice(0, 8)}
                      </Link>
                    )}
                    {m.planoId && <span>Plano {m.planoId.slice(0, 8)}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {proximo && (
          <p className="mt-6">
            <Link className="btn" href={`/conversas/${usuario.id}?cursor=${proximo}`}>
              Mensagens seguintes
            </Link>
          </p>
        )}
      </section>
    </>
  );
}
