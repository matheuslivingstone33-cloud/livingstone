// Documentação pública da API v1. Estática: sem banco, sessão ou data atual.
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND } from "@/lib/brand";
import { API_MAX_BODY_BYTES } from "@/lib/api-http";
import { API_LIMITS } from "@/lib/api-payload";
import { formatBytes } from "@/lib/upload-limits";

const CORPO_MAX = formatBytes(API_MAX_BODY_BYTES);
const ARQUIVO_MAX = formatBytes(API_LIMITS.arquivoBytes);

export const metadata: Metadata = {
  title: `API — ${BRAND.name}`,
  description: "Documentação da API de conciliação: autenticação por chave, escopos, idempotência, limites e erros.",
};

const BASE = "https://SEU-DOMINIO";

// Trecho real de public/demo/titulos_esperados.csv convertido para JSON
const POST_BODY = `{
  "nome": "Retorno 05/10 via ERP",
  "esperados": [
    { "referencia": "10000101", "pagador": "Padaria Pão Quente Ltda", "valor": 1250.00, "vencimento": "2026-10-05" },
    { "referencia": "10000102", "pagador": "Mercado Bom Preço ME", "valor": 3480.50, "vencimento": "2026-10-05" },
    { "referencia": "10000103", "pagador": "Oficina Dois Irmãos", "valor": 890.00, "vencimento": "2026-10-06" }
  ],
  "banco": {
    "lancamentos": [
      { "referencia": "10000101", "valor": 1250.00, "data": "2026-10-05" },
      { "referencia": "10000102", "valor": 3480.50, "data": "2026-10-05" }
    ]
  },
  "opcoes": { "toleranciaCentavos": 2, "valorEData": true, "toleranciaDias": 3 }
}`;

const CURL_POST = `curl -X POST ${BASE}/api/v1/conciliacoes \\
  -H "Authorization: Bearer fo_live_xxxxxxxx_..." \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: erp-retorno-2026-10-05" \\
  -d @conciliacao.json`;

const CURL_FILE = `# Em vez de "lancamentos", envie o arquivo de retorno do banco (OFX, CNAB 400, CNAB 240 ou CSV) em base64
"banco": {
  "arquivo": { "nome": "retorno_cnab400.ret", "conteudoBase64": "MDJSRVRPUk5PMDFDT0JSQU5DQS..." }
}`;

const RESP_201 = `HTTP/1.1 201 Created
{
  "id": "cm…",
  "nome": "Retorno 05/10 via ERP",
  "criadaEm": "2026-10-20T12:00:00.000Z",
  "formatoBanco": "JSON",
  "resumo": { "conciliados": 2, "divergentes": 0, "pendentes": 1, "naoEsperados": 0,
              "totalEsperado": 5620.5, "totalRecebido": 4730.5, "excedente": 0 },
  "opcoes": { "toleranciaCentavos": 2, "casarPorValorData": true, "toleranciaDias": 3 }
}`;

const CURL_GET = `curl "${BASE}/api/v1/conciliacoes?pagina=1&limite=20" \\
  -H "Authorization: Bearer fo_live_xxxxxxxx_..."

curl ${BASE}/api/v1/conciliacoes/cm… \\
  -H "Authorization: Bearer fo_live_xxxxxxxx_..."`;

const ERR = `{
  "error": {
    "code": "validation_error",
    "message": "Corpo inválido.",
    "details": [{ "campo": "esperados[0].vencimento", "mensagem": "Data no formato AAAA-MM-DD." }]
  }
}`;

const ERRORS: [string, string, string][] = [
  ["400", "validation_error · invalid_json · idempotency_key_required", "Corpo inválido, JSON malformado ou Idempotency-Key ausente"],
  ["401", "unauthorized", "Chave ausente, inválida ou revogada (sempre a mesma resposta)"],
  ["403", "insufficient_scope", "A chave não tem o escopo da operação"],
  ["404", "not_found", "Recurso inexistente ou de outra instituição"],
  ["409", "request_in_progress", "Outra requisição com a mesma Idempotency-Key está em processamento"],
  ["413", "payload_too_large", `Corpo acima de ${CORPO_MAX}`],
  ["422", "idempotency_key_reused", "Idempotency-Key já usada com outro corpo"],
  ["429", "rate_limited", "Mais de 60 requisições por minuto na chave (veja Retry-After)"],
  ["500", "internal_error", "Erro interno; pode repetir com a mesma Idempotency-Key"],
];

const NAV = [["auth", "Autenticação"], ["escopos", "Escopos"], ["criar", "Criar"], ["consultar", "Consultar"], ["idempotencia", "Idempotência"], ["limites", "Limites"], ["erros", "Erros"]];

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-xl bg-ink-950 p-4 font-mono text-xs leading-relaxed text-brand-100">{children}</pre>;
}

function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-4 border-t border-line py-10">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink-900">{title}</h2>
      <div className="space-y-4 text-sm leading-relaxed text-ink-700">{children}</div>
    </section>
  );
}

const C = ({ children }: { children: React.ReactNode }) => <code className="font-mono">{children}</code>;

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-paper text-ink-900">
      <header className="on-ink surface-ink bg-ink-950 pb-10">
        <div className="relative mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="rounded-xl" aria-label="Voltar"><Logo size={32} /></Link>
          <nav className="flex items-center gap-3 text-sm text-brand-100" aria-label="Acesso">
            <Link href="/tour" className="hover:text-white">Tour</Link>
            <Link href="/login" className="rounded-xl border border-white/20 px-4 py-2 font-medium text-white transition-colors hover:border-white/40 hover:bg-white/10">Entrar</Link>
          </nav>
        </div>
        <div className="relative mx-auto max-w-4xl px-6 pt-6">
          <p className="eyebrow flex items-center gap-3 text-gold-300"><span className="rule-gold" aria-hidden="true" />API · v1 · 2026-10</p>
          <h1 className="font-display mt-4 text-4xl font-semibold leading-tight tracking-tight text-balance text-white md:text-5xl">API de conciliação</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-100/85">
            Envie os títulos esperados e os créditos do banco a partir do seu ERP e receba o resultado com as mesmas regras da tela de conciliação.
          </p>
          <nav aria-label="Seções" className="mt-6 flex flex-wrap gap-2">
            {NAV.map(([h, l]) => (
              <a key={h} href={`#${h}`} className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-brand-100 transition-colors hover:border-white/40 hover:text-white">{l}</a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-16">
        <Sec id="auth" title="Autenticação">
          <p>Um administrador cria a chave em <strong>Configurações → Chaves da API</strong>. O segredo aparece uma única vez; guardamos apenas o hash. A chave pertence à instituição: continua valendo se quem a criou for desativado, até ser revogada na mesma tela.</p>
          <Code>{`Authorization: Bearer fo_live_<prefixo>_<segredo>`}</Code>
          <p>Use somente HTTPS e nunca coloque a chave em código de navegador ou aplicativo.</p>
        </Sec>

        <Sec id="escopos" title="Escopos">
          <ul className="list-disc space-y-1 pl-5">
            <li><C>conciliacao:write</C>: criar conciliações (POST).</li>
            <li><C>conciliacao:read</C>: listar e consultar conciliações (GET).</li>
            <li>Reservados para próximas versões: <C>cobranca:write</C>, <C>pld:write</C>, <C>pld:read</C>.</li>
          </ul>
        </Sec>

        <Sec id="criar" title="POST /api/v1/conciliacoes">
          <p>Campos: <C>nome</C>; <C>esperados</C> (até 20.000: referencia, pagador opcional, valor em reais, vencimento AAAA-MM-DD); <C>banco</C> com <em>exatamente um</em> entre <C>lancamentos</C> (referencia opcional, valor, data) e <C>arquivo</C> (nome e conteudoBase64, até {ARQUIVO_MAX} antes da codificação); <C>opcoes</C> opcional (toleranciaCentavos 0 a 100, valorEData, toleranciaDias 0 a 10). O layout CNAB 400 é o configurado pela instituição.</p>
          <Code>{POST_BODY}</Code>
          <Code>{CURL_POST}</Code>
          <Code>{CURL_FILE}</Code>
          <Code>{RESP_201}</Code>
        </Sec>

        <Sec id="consultar" title="GET /api/v1/conciliacoes e /api/v1/conciliacoes/{id}">
          <p>A lista é paginada (<C>pagina</C>, <C>limite</C> até 100) e traz o resumo de cada conciliação. O detalhe inclui os itens, com situação (CONCILIADO, DIVERGENTE, PENDENTE, NAO_ESPERADO, VINCULADO, BAIXADO), regra de casamento (REFERENCIA, REFERENCIA_DV, VALOR_DATA ou MANUAL) e observação. Itens fechados por uma pessoa trazem também <C>situacaoOriginal</C>, <C>resolucao</C> (MANUAL_VINCULO, ACEITE_DIVERGENCIA ou BAIXA), <C>justificativa</C>, <C>resolvidoPor</C>, <C>resolvidoEm</C> e <C>itemVinculado</C> (referência do outro item do vínculo); nos demais esses campos vêm nulos. VINCULADO é o crédito não esperado que foi unido a um título; BAIXADO é o item encerrado sem conciliação. Nenhum dos dois conta como pendente ou não esperado no resumo.</p>
          <Code>{CURL_GET}</Code>
        </Sec>

        <Sec id="idempotencia" title="Idempotência">
          <p>Todo POST exige o header <C>Idempotency-Key</C> (1 a 100 caracteres: letras, números, _ ou -). Por 24 horas, repetir a mesma chave com o mesmo corpo devolve a resposta original, com o header <C>Idempotent-Replay: true</C>, sem criar outra conciliação. A mesma chave com outro corpo devolve 422. A ordem das chaves do JSON não importa.</p>
        </Sec>

        <Sec id="limites" title="Limites">
          <ul className="list-disc space-y-1 pl-5">
            <li>60 requisições por minuto por chave; acima disso, 429 com <C>Retry-After</C>.</li>
            <li>Corpo de até {CORPO_MAX}; arquivo do banco de até {ARQUIVO_MAX}; até 20.000 títulos e 20.000 lançamentos.</li>
          </ul>
        </Sec>

        <Sec id="erros" title="Erros">
          <p>O <C>code</C> é estável (em inglês) e pode ser usado no seu código; a <C>message</C> é para pessoas.</p>
          <Code>{ERR}</Code>
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="table">
              <thead><tr><th>Status</th><th>code</th><th>Quando</th></tr></thead>
              <tbody>
                {ERRORS.map(([s, c, w]) => (
                  <tr key={s}><td className="font-medium tabular-nums">{s}</td><td><code className="font-mono text-xs">{c}</code></td><td className="text-ink-600">{w}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>
      </main>
    </div>
  );
}
