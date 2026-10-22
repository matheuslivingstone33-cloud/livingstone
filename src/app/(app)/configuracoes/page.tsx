import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { appUrl } from "@/lib/payments";
import { saveSettings, rotateWebhookSecret } from "../../actions-config";
import { importRestrictedList } from "../../actions-pld";
import { revokeApiKey } from "../../actions-api";
import { ApiKeyForm } from "@/components/ApiKeyForm";
import { PageTitle, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { FileSizeGuard } from "@/components/FileSizeGuard";
import { CopyButton } from "@/components/CopyButton";
import { dt } from "@/lib/format";
import { TASKS, modelFor, type AiTask } from "@/lib/ai-config";
import { diaSP, inicioDoDiaSP } from "@/lib/tz";

// Tempo máximo da função na Vercel (actions e exportações longas)
export const maxDuration = 60;

function Field({ label, name, value, hint, suffix }: { label: string; name: string; value: string | number; hint?: string; suffix?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <div className="flex items-center gap-2">
        <input className="input" id={name} name={name} defaultValue={value} />
        {suffix && <span className="shrink-0 text-xs font-medium text-ink-500">{suffix}</span>}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function SectionHead({ n, title, children }: { n: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b border-line pb-4">
      <span className="font-display mt-0.5 text-lg tabular-nums text-gold-600" aria-hidden="true">{n}</span>
      <div className="min-w-0">
        <h2 className="card-title">{title}</h2>
        {children && <p className="mt-1 text-sm leading-relaxed text-ink-500">{children}</p>}
      </div>
    </div>
  );
}

const P = (n: number) => +(n * 100).toFixed(2);

const TASK_LABEL: Record<AiTask, string> = { cobranca: "Cobrança", pld: "PLD", credito: "Crédito", legado: "Legado" };
const usd = (n: number) => `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

// Consumo de IA da instituição desde um instante (custo inclui reservas em andamento)
async function aiConsumo(orgId: string, since: Date) {
  const rows = await db.aiUsage.groupBy({ by: ["task", "status"], where: { orgId, createdAt: { gte: since } }, _sum: { costUsd: true }, _count: true });
  const porTarefa = new Map<string, { custo: number; chamadas: number }>();
  let custo = 0;
  let chamadas = 0;
  let bloqueadas = 0;
  for (const r of rows) {
    const c = Number(r._sum.costUsd ?? 0);
    custo += c;
    if (r.status === "bloqueada_limite") {
      bloqueadas += r._count;
      continue;
    }
    chamadas += r._count;
    const t = porTarefa.get(r.task) ?? { custo: 0, chamadas: 0 };
    porTarefa.set(r.task, { custo: t.custo + c, chamadas: t.chamadas + r._count });
  }
  return { custo, chamadas, bloqueadas, porTarefa };
}

export default async function ConfigPage({ searchParams }: { searchParams: Promise<{ salvo?: string; lista?: string; n?: string; webhook?: string }> }) {
  const s = await requireSession(["ADMIN"]);
  const q = await searchParams;
  const c = await getSettings(s.orgId);
  const lists = await db.restrictedEntry.groupBy({ by: ["source"], where: { orgId: s.orgId }, _count: true, _max: { importedAt: true } });
  const apiKeys = await db.apiKey.findMany({
    where: { orgId: s.orgId },
    orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true, createdBy: { select: { name: true, active: true } } },
  });
  const now = new Date();
  const hojeSP = diaSP(now);
  const [iaHoje, iaMes] = await Promise.all([aiConsumo(s.orgId, inicioDoDiaSP(hojeSP)), aiConsumo(s.orgId, inicioDoDiaSP(`${hojeSP.slice(0, 8)}01`))]);
  const webhookUrl = c.pix.webhookSecret ? `${appUrl()}/api/pix/webhook/${s.orgId}` : "";

  return (
    <>
      <PageTitle eyebrow="Administração" title="Configurações" subtitle="Ajustes da instituição: valem para todos os usuários e ficam registrados na auditoria" />
      {q.salvo && <Notice>Configurações salvas.</Notice>}
      {q.lista && <Notice>Lista {q.lista} importada: {q.n} registros.</Notice>}

      <nav aria-label="Seções das configurações" className="mb-6 flex flex-wrap gap-2">
        {[["#pix", "Pix"], ["#cnab", "CNAB 400"], ["#credito", "Crédito"], ["#cobranca", "Cobrança"], ["#pld", "PLD"], ["#ia", "IA"], ["#webhook", "Webhook"], ["#listas", "Listas"], ["#api", "API"]].map(([h, l]) => (
          <a key={h} href={h} className="chip">{l}</a>
        ))}
      </nav>

      <form action={saveSettings} className="space-y-6">
        <section className="card space-y-5" id="pix">
          <SectionHead n="01" title="Pix (recebimento dos acordos)" />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Chave Pix" name="pix_key" value={c.pix.key} hint="E-mail, +55 telefone, CPF, CNPJ ou chave aleatória" />
            <Field label="Nome do recebedor" name="pix_merchant" value={c.pix.merchant} hint="Até 25 caracteres, como no banco" />
            <Field label="Cidade" name="pix_city" value={c.pix.city} hint="Até 15 caracteres" />
          </div>
        </section>

        <section className="card space-y-5" id="cnab">
          <SectionHead n="02" title="Layout CNAB 400 do banco">
            Posições do registro de detalhe (1 a 400) conforme o manual de retorno do banco. O CNAB 240 segue o padrão FEBRABAN e não precisa de ajuste.
          </SectionHead>
          <div className="grid gap-4 md:grid-cols-4">
            {([
              ["cnab_nn", "Nosso número", c.cnab400.nossoNumero],
              ["cnab_oc", "Código de ocorrência", c.cnab400.ocorrencia],
              ["cnab_dt", "Data da ocorrência (DDMMAA)", c.cnab400.dataOcorrencia],
              ["cnab_vp", "Valor pago", c.cnab400.valorPago],
            ] as const).map(([k, l, [a, b]]) => (
              <div key={k}>
                <div className="label">{l}</div>
                <div className="flex items-center gap-2">
                  <input className="input" name={`${k}_ini`} defaultValue={a} aria-label={`${l}: início`} />
                  <span className="text-xs text-ink-500">a</span>
                  <input className="input" name={`${k}_fim`} defaultValue={b} aria-label={`${l}: fim`} />
                </div>
              </div>
            ))}
          </div>
          <Field label="Códigos de liquidação" name="cnab_codigos" value={c.cnab400.codigosLiquidacao.join(", ")} hint="Ocorrências que significam pagamento (ex.: 06, 08, 10)" />
        </section>

        <section className="card space-y-5" id="credito">
          <SectionHead n="03" title="Política de crédito" />
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Comprometimento máximo" name="cr_max" value={P(c.credit.maxCommitment)} suffix="% da renda" />
            <Field label="Comprometimento de atenção" name="cr_warn" value={P(c.credit.warnCommitment)} suffix="% da renda" />
            <Field label="Score para aprovar" name="cr_approve" value={c.credit.approveScore} hint="0 a 1000" />
            <Field label="Score abaixo do qual recusa" name="cr_reject" value={c.credit.rejectScore} />
          </div>
        </section>

        <section className="card space-y-5" id="cobranca">
          <SectionHead n="04" title="Política de cobrança" />
          <div className="grid gap-4 md:grid-cols-5">
            <Field label="Multa" name="co_multa" value={P(c.collection.multa)} suffix="%" hint="Máximo 2% (CDC)" />
            <Field label="Juros de mora" name="co_juros" value={P(c.collection.jurosMes)} suffix="% a.m." />
            <Field label="Piso do acordo" name="co_floor" value={P(c.collection.floorPct)} suffix="% do original" />
            <Field label="Parcela mínima" name="co_min" value={c.collection.minInstallment} suffix="R$" />
            <Field label="Validade da proposta" name="co_validade" value={c.collection.validityDays} suffix="dias" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="table [&_td]:px-2 [&_td]:py-2 [&_.input]:min-w-24">
              <thead><tr><th>Faixa</th><th>Até (dias de atraso)</th><th>Desconto à vista (%)</th><th>Desconto parcelado (%)</th><th>Máx. parcelas</th></tr></thead>
              <tbody>
                {c.collection.bands.map((b, i) => (
                  <tr key={i}>
                    <td><input className="input" name={`band${i}_label`} defaultValue={b.label} aria-label="Nome da faixa" /></td>
                    <td><input className="input" name={`band${i}_maxDays`} defaultValue={b.maxDays} aria-label="Até dias" /></td>
                    <td><input className="input" name={`band${i}_cash`} defaultValue={P(b.cash)} aria-label="Desconto à vista" /></td>
                    <td><input className="input" name={`band${i}_parcel`} defaultValue={P(b.parcel)} aria-label="Desconto parcelado" /></td>
                    <td><input className="input" name={`band${i}_maxInstallments`} defaultValue={b.maxInstallments} aria-label="Máximo de parcelas" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card space-y-5" id="pld">
          <SectionHead n="05" title="Monitoramento de PLD">
            Calibre com o perfil da sua carteira e documente a escolha na Avaliação Interna de Risco (Circular 3.978, art. 10).
          </SectionHead>
          <div className="grid gap-4 md:grid-cols-5">
            <Field label="Limite de espécie" name="pld_cash" value={c.pld.cashLimit} suffix="R$" />
            <Field label="Janela de fracionamento" name="pld_frac_dias" value={c.pld.structuringDays} suffix="dias" />
            <Field label="Mín. operações fracionadas" name="pld_frac_ops" value={c.pld.structuringMinOps} />
            <Field label="Renda: alerta acima de" name="pld_renda" value={c.pld.incomeRatio} suffix="x" />
            <Field label="Renda: alerta grave acima de" name="pld_renda_alta" value={c.pld.incomeRatioHigh} suffix="x" />
            <Field label="Passagem: janela" name="pld_pass_horas" value={c.pld.passthroughHours} suffix="horas" />
            <Field label="Passagem: saída mínima" name="pld_pass_pct" value={P(c.pld.passthroughPct)} suffix="%" />
            <Field label="Remetentes distintos" name="pld_remetentes" value={c.pld.manyPayers} />
            <Field label="Pontuação para abrir caso" name="pld_score" value={c.pld.caseMinScore} />
            <Field label="Prazo de análise" name="pld_prazo" value={c.pld.analysisDays} suffix="dias" hint="Máximo 45" />
          </div>
        </section>

        <section className="card space-y-5" id="ia">
          <SectionHead n="06" title="IA: teto diário e consumo">
            Cada tarefa usa o modelo adequado ao trabalho: mensagens de cobrança, dossiês de PLD e leitura de documentos de crédito usam um modelo rápido e econômico; a modernização de código legado usa um modelo mais capaz. O texto da IA sempre passa pela conferência automática antes de aparecer. Ao atingir o teto do dia (horário de Brasília), os módulos seguem funcionando sem IA, com o texto padrão.
          </SectionHead>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Gasto máximo por dia" name="ai_usd" value={c.ai.dailyLimitUsd} suffix="US$" hint="0 a 1000. Use 0 para desligar a IA." />
            <Field label="Chamadas por dia" name="ai_calls" value={c.ai.dailyLimitCalls} hint="0 a 10000. Use 0 para desligar a IA." />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {([["Hoje", iaHoje], ["Este mês", iaMes]] as const).map(([titulo, x]) => (
              <div key={titulo} className="rounded-xl border border-line p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-ink-500">{titulo}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{usd(x.custo)}</div>
                <p className="text-sm text-ink-600">
                  {x.chamadas} chamada(s) · {x.bloqueadas} bloqueada(s) pelo teto
                </p>
                {x.porTarefa.size > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-ink-600">
                    {[...x.porTarefa].map(([t, v]) => (
                      <li key={t} className="flex justify-between gap-3 tabular-nums">
                        <span>{TASK_LABEL[t as AiTask] ?? t}</span>
                        <span>{usd(v.custo)} · {v.chamadas}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className="hint">
            Modelos em uso: {(Object.keys(TASKS) as AiTask[]).map((t) => `${TASK_LABEL[t]}: ${modelFor(t)}`).join(" · ")}. Valores estimados pela tabela de preços do fornecedor; a fatura oficial é a do fornecedor.
          </p>
        </section>

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/90 px-5 py-3 shadow-lift backdrop-blur-md">
          <p className="text-xs text-ink-500">As alterações valem para todos os usuários e ficam registradas na auditoria.</p>
          <SubmitButton pending="Salvando...">Salvar configurações</SubmitButton>
        </div>
      </form>

      <section className="card mt-6 space-y-4" id="webhook">
        <SectionHead n="07" title="Baixa automática do Pix (webhook)">
          Cadastre esta URL no seu banco/PSP como webhook da chave Pix e configure o segredo no header x-webhook-secret. Cada Pix recebido de um acordo é baixado automaticamente, sem digitação. O mesmo Pix nunca é baixado duas vezes.
        </SectionHead>
        {webhookUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-xl border border-line bg-paper px-3 py-2 font-mono text-xs text-ink-700">{webhookUrl}</code>
            <CopyButton text={webhookUrl} label="Copiar URL" />
            <CopyButton text={c.pix.webhookSecret} label="Copiar segredo (header x-webhook-secret)" />
            <p className="w-full text-xs text-ink-500">Exceção: se o PSP não permitir header customizado, é possível enviar <code>?secret=</code> na URL, mas só com <code>PIX_WEBHOOK_ALLOW_QUERY_SECRET=1</code> no servidor (o segredo passa a aparecer em logs).</p>
          </div>
        ) : (
          <p className="notice notice-warning mb-0">Nenhum segredo gerado ainda: o webhook está desligado.</p>
        )}
        <form action={rotateWebhookSecret}>
          <SubmitButton pending="Gerando...">{webhookUrl ? "Gerar novo segredo (invalida o anterior)" : "Ativar webhook"}</SubmitButton>
        </form>
      </section>

      <section className="card mt-6 space-y-5" id="listas">
        <SectionHead n="08" title="Listas restritivas e PEP" />
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="table">
            <thead><tr><th>Lista</th><th>Onde obter</th><th className="num">Registros</th><th>Atualizada em</th></tr></thead>
            <tbody>
              {[
                ["CSNU", "XML consolidado do Conselho de Segurança da ONU (scsanctions.un.org)"],
                ["OFAC", "sdn.csv do Tesouro dos EUA (sanctionslist.ofac.treas.gov)"],
                ["PEP", "CSV de PEP do Portal da Transparência (CGU)"],
                ["INTERNA", "CSV próprio: nome; documento; motivo"],
              ].map(([src, where]) => {
                const l = lists.find((x) => x.source === src);
                return (
                  <tr key={src}>
                    <td className="font-medium">{src}</td>
                    <td className="text-ink-600">{where}</td>
                    <td className="num">{l?._count ?? 0}</td>
                    <td className="whitespace-nowrap text-ink-500">{l?._max.importedAt ? dt(l._max.importedAt) : "nunca"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <form action={importRestrictedList} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="source">Lista</label>
            <select className="input" id="source" name="source" defaultValue="CSNU">
              <option>CSNU</option>
              <option>OFAC</option>
              <option>PEP</option>
              <option>INTERNA</option>
            </select>
          </div>
          <div className="min-w-64 flex-1">
            <label className="label" htmlFor="list-file">Arquivo</label>
            <input className="input" id="list-file" name="file" type="file" accept=".xml,.csv,.txt" required />
            <p className="hint mt-1">Até 4 MB por envio.</p>
            <FileSizeGuard inputIds={["list-file"]} />
          </div>
          <SubmitButton pending="Importando...">Importar (substitui a lista)</SubmitButton>
        </form>
        <p className="hint">Atualize as listas de sanções ao menos semanalmente: a Lei 13.810/2019 exige cumprimento imediato das resoluções do CSNU.</p>
      </section>

      <section className="card mt-6 space-y-5" id="api">
        <SectionHead n="09" title="Chaves da API">
          Para o ERP ou outro sistema da instituição enviar conciliações sem passar pela tela. A chave é da instituição: desativar quem a criou não a revoga. Veja a <a href="/docs/api" className="font-medium text-brand-700 underline">documentação da API</a>.
        </SectionHead>
        <ApiKeyForm />
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="table">
            <thead><tr><th>Nome</th><th>Prefixo</th><th>Escopos</th><th>Criada por</th><th>Última utilização</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {apiKeys.length === 0 && (
                <tr><td colSpan={7} className="text-center text-ink-500">Nenhuma chave criada.</td></tr>
              )}
              {apiKeys.map((k) => (
                <tr key={k.id}>
                  <td className="font-medium">{k.name}</td>
                  <td><code className="font-mono text-xs">fo_live_{k.prefix}_…</code></td>
                  <td className="text-xs text-ink-600">{k.scopes.join(", ")}</td>
                  <td className="whitespace-nowrap text-ink-600">{k.createdBy.name}{!k.createdBy.active && <span className="text-xs text-ink-500"> (desativado)</span>}<div className="text-xs text-ink-500">{dt(k.createdAt)}</div></td>
                  <td className="whitespace-nowrap text-ink-500">{k.lastUsedAt ? dt(k.lastUsedAt) : "nunca"}</td>
                  <td>
                    {k.revokedAt
                      ? <span className="badge bg-slate-100 text-slate-700">Revogada em {dt(k.revokedAt)}</span>
                      : <span className="badge bg-emerald-50 text-emerald-700">Ativa</span>}
                  </td>
                  <td className="text-right">
                    {!k.revokedAt && (
                      <form action={revokeApiKey}>
                        <input type="hidden" name="id" value={k.id} />
                        <button type="submit" className="btn-danger">Revogar</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
