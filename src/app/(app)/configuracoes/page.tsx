import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { appUrl } from "@/lib/payments";
import { saveSettings, rotateWebhookSecret } from "../../actions-config";
import { importRestrictedList } from "../../actions-pld";
import { PageTitle, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";
import { dt } from "@/lib/format";

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

export default async function ConfigPage({ searchParams }: { searchParams: Promise<{ salvo?: string; lista?: string; n?: string; webhook?: string }> }) {
  const s = await requireSession(["ADMIN"]);
  const q = await searchParams;
  const c = await getSettings(s.orgId);
  const lists = await db.restrictedEntry.groupBy({ by: ["source"], where: { orgId: s.orgId }, _count: true, _max: { importedAt: true } });
  const webhookUrl = c.pix.webhookSecret ? `${appUrl()}/api/pix/webhook/${s.orgId}?secret=${c.pix.webhookSecret}` : "";

  return (
    <>
      <PageTitle eyebrow="Administração" title="Configurações" subtitle="Ajustes da instituição: valem para todos os usuários e ficam registrados na auditoria" />
      {q.salvo && <Notice>Configurações salvas.</Notice>}
      {q.lista && <Notice>Lista {q.lista} importada: {q.n} registros.</Notice>}

      <nav aria-label="Seções das configurações" className="mb-6 flex flex-wrap gap-2">
        {[["#pix", "Pix"], ["#cnab", "CNAB 400"], ["#credito", "Crédito"], ["#cobranca", "Cobrança"], ["#pld", "PLD"], ["#webhook", "Webhook"], ["#listas", "Listas"]].map(([h, l]) => (
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

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/90 px-5 py-3 shadow-lift backdrop-blur-md">
          <p className="text-xs text-ink-500">As alterações valem para todos os usuários e ficam registradas na auditoria.</p>
          <SubmitButton pending="Salvando...">Salvar configurações</SubmitButton>
        </div>
      </form>

      <section className="card mt-6 space-y-4" id="webhook">
        <SectionHead n="06" title="Baixa automática do Pix (webhook)">
          Cadastre esta URL no seu banco/PSP como webhook da chave Pix. Cada Pix recebido de um acordo é baixado automaticamente, sem digitação. O mesmo Pix nunca é baixado duas vezes.
        </SectionHead>
        {webhookUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-xl border border-line bg-paper px-3 py-2 font-mono text-xs text-ink-700">{webhookUrl.replace(c.pix.webhookSecret, "••••••••")}</code>
            <CopyButton text={webhookUrl} label="Copiar URL completa" />
          </div>
        ) : (
          <p className="notice notice-warning mb-0">Nenhum segredo gerado ainda: o webhook está desligado.</p>
        )}
        <form action={rotateWebhookSecret}>
          <SubmitButton pending="Gerando...">{webhookUrl ? "Gerar novo segredo (invalida o anterior)" : "Ativar webhook"}</SubmitButton>
        </form>
      </section>

      <section className="card mt-6 space-y-5" id="listas">
        <SectionHead n="07" title="Listas restritivas e PEP" />
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
          </div>
          <SubmitButton pending="Importando...">Importar (substitui a lista)</SubmitButton>
        </form>
        <p className="hint">Atualize as listas de sanções ao menos semanalmente: a Lei 13.810/2019 exige cumprimento imediato das resoluções do CSNU.</p>
      </section>
    </>
  );
}
