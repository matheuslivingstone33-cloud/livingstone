// Prova de um item da conciliação: as duas fontes lado a lado, como estavam no arquivo, e a regra aplicada.
import { Badge, Notice } from "@/components/ui";
import { fraseRegra, partesDestacadas, type Destaque, type Lado, type Prova } from "@/lib/prova-conciliacao";

const CAMPO: Record<keyof Destaque, string> = { referencia: "referência", valor: "valor", data: "data" };

function campoDaColuna(d: Destaque, i: number): keyof Destaque | undefined {
  return (Object.keys(d) as (keyof Destaque)[]).find((k) => {
    const m = d[k];
    return !!m && "coluna" in m && m.coluna === i;
  });
}

function Fonte({ titulo, lado, vazio }: { titulo: string; lado?: Lado; vazio: string }) {
  if (!lado)
    return (
      <section className="card">
        <h3 className="font-medium text-ink-900">{titulo}</h3>
        <p className="hint mt-2">{vazio}</p>
      </section>
    );
  const posicao = lado.formato === "JSON" ? `item ${lado.linha} da lista enviada` : lado.formato === "OFX" ? `transação ${lado.linha}` : `linha ${lado.linha}`;
  const usados = (Object.keys(lado.destaque) as (keyof Destaque)[]).filter((k) => lado.destaque[k]).map((k) => CAMPO[k]);
  return (
    <section className="card min-w-0">
      <h3 className="font-medium text-ink-900">{titulo}</h3>
      <p className="mt-1 break-all text-xs text-ink-500">
        <b className="text-ink-700">{lado.arquivo}</b> ({lado.formato}) · {posicao} ·{" "}
        <span title={`SHA-256 do arquivo enviado: ${lado.sha256}`} className="font-mono">hash {lado.sha256.slice(0, 12)}</span>
      </p>
      {lado.celulas ? (
        <div className="mt-3 overflow-x-auto">
          <table className="table text-xs">
            {lado.cabecalho && lado.cabecalho.length > 0 && (
              <thead>
                <tr>{lado.cabecalho.map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
            )}
            <tbody>
              <tr>
                {lado.celulas.map((c, i) => {
                  const campo = campoDaColuna(lado.destaque, i);
                  return <td key={i} className="font-mono">{campo ? <mark title={CAMPO[campo]}>{c}</mark> : c}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      ) : lado.bruto ? (
        <pre className="mt-3 overflow-x-auto whitespace-pre rounded-lg border border-line bg-paper p-3 font-mono text-[11px] leading-5 text-ink-800">
          {partesDestacadas(lado.bruto, lado.destaque).map((p, i) => (p.campo ? <mark key={i} title={CAMPO[p.campo]}>{p.texto}</mark> : <span key={i}>{p.texto}</span>))}
        </pre>
      ) : (
        <p className="hint mt-2">Linha não disponível.</p>
      )}
      {usados.length > 0 && <p className="hint mt-2">Destacado: {usados.join(", ")}.</p>}
      {lado.truncada && <p className="hint mt-1">Linha longa: guardamos só as colunas usadas na conferência.</p>}
    </section>
  );
}

export function ProvaView({ prova, frase }: { prova: Prova | null; frase: string }) {
  if (!prova) return <Notice tone="info">Prova indisponível (conciliação anterior a esta versão).</Notice>;
  if (prova.omitida) return <Notice tone="info">Prova não guardada: esta conciliação passou do limite de tamanho das provas.</Notice>;
  return (
    <div className="grid gap-4">
      <p className="font-medium text-ink-900">{frase}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Fonte titulo="O que você esperava receber" lado={prova.esperado} vazio="Este crédito não tem cobrança na lista de esperados." />
        <Fonte titulo="O que caiu no banco" lado={prova.banco} vazio="Nenhum crédito correspondente no arquivo do banco." />
      </div>
      <section className="card">
        <h3 className="flex flex-wrap items-center gap-2 font-medium text-ink-900">
          Regra aplicada
          {prova.regra.explicadoTaxa && <Badge tone="info">Explicado pela taxa</Badge>}
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
          {fraseRegra(prova.regra).map((f) => <li key={f}>{f}</li>)}
        </ul>
        <p className="hint mt-2">CPF e CNPJ aparecem mascarados. O arquivo original não fica guardado; o hash permite conferir que é o mesmo arquivo.</p>
      </section>
    </div>
  );
}
