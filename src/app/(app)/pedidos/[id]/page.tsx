import { detalharPedido } from "@/app/actions-pedidos";
import { CopyButton } from "@/components/CopyButton";
import { Badge, CardHeader, PageTitle } from "@/components/ui";
import { ROTULO_STATUS, type StatusPedido } from "@/lib/pedidos";
import { fmtDataHora } from "@/lib/tz";

const BLOCOS = [
  ["problema", "Problema"],
  ["diaADia", "Uso no dia a dia"],
  ["jaExiste", "O que já existe"],
  ["novo", "O que seria novo"],
] as const;

export const dynamic = "force-dynamic";

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await detalharPedido((await params).id);
  return (
    <>
      <PageTitle eyebrow="Pedidos" title={p.titulo} subtitle={`${p.instituicao} · por ${p.autor} · criado em ${fmtDataHora(p.criadoEm)} · atualizado em ${fmtDataHora(p.atualizadoEm)}`} back={{ href: "/pedidos", label: "Pedidos" }} />
      <p className="mb-6">
        <Badge tone={p.status === "CONSENSO" ? "success" : p.status === "AGUARDANDO_CONFIRMACAO" ? "warning" : "neutral"}>{ROTULO_STATUS[p.status as StatusPedido] ?? p.status}</Badge>
      </p>

      <section className="card mb-6">
        <CardHeader title="Prompt para implementação">{p.prompt && <CopyButton text={p.prompt} label="Copiar prompt" />}</CardHeader>
        {p.prompt ? (
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-4 font-mono text-xs leading-relaxed text-ink-800">{p.prompt}</pre>
        ) : (
          <p className="text-sm text-ink-600">O prompt é gerado quando a pessoa confirma o entendimento.</p>
        )}
      </section>

      <section className="card mb-6">
        <CardHeader title={`Versões (${p.versoes.length})`} />
        {p.versoes.length === 0 ? (
          <p className="text-sm text-ink-600">Nenhuma versão registrada.</p>
        ) : (
          <ol className="space-y-4">
            {[...p.versoes].reverse().map((v) => (
              <li key={v.n} className="rounded-xl border border-line p-4">
                <p className="text-xs text-ink-500">
                  Versão {v.n} · {fmtDataHora(v.em)}
                </p>
                <p className="mt-1 font-semibold text-ink-900">{v.titulo}</p>
                <dl className="mt-2 space-y-2 text-sm">
                  {BLOCOS.map(([k, r]) => (
                    <div key={k}>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">{r}</dt>
                      <dd className="whitespace-pre-line text-ink-800">{v[k]}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card">
        <CardHeader title="Conversa" />
        {p.transcricao.length === 0 ? (
          <p className="text-sm text-ink-600">Sem mensagens registradas.</p>
        ) : (
          <ol className="space-y-3 text-sm">
            {p.transcricao.map((m, i) => (
              <li key={i} className={m.role === "user" ? "text-ink-900" : "text-ink-700"}>
                <p className="text-xs text-ink-500">
                  {m.role === "user" ? p.autor : "Assistente"} · {fmtDataHora(m.em)}
                </p>
                <p className="whitespace-pre-line">{m.texto}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
