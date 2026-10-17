import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { appUrl } from "@/lib/payments";
import { saveSettings, rotateWebhookSecret } from "../../actions-config";
import { importRestrictedList } from "../../actions-pld";
import { PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";
import { dt } from "@/lib/format";

function Field({ label, name, value, hint, suffix }: { label: string; name: string; value: string | number; hint?: string; suffix?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <div className="flex items-center gap-2">
        <input className="input" id={name} name={name} defaultValue={value} />
        {suffix && <span className="shrink-0 text-sm text-slate-500">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
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
      <PageTitle title="Configurações" subtitle="Ajustes da instituição: valem para todos os usuários e ficam registrados na auditoria" />
      {q.salvo && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Configurações salvas.</p>}
      {q.lista && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Lista {q.lista} importada: {q.n} registros.</p>}

      <form action={saveSettings} className="space-y-6">
        <section className="card space-y-4" id="pix">
          <h2 className="font-semibold">Pix (recebimento dos acordos)</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Chave Pix" name="pix_key" value={c.pix.key} hint="E-mail, +55 telefone, CPF, CNPJ ou chave aleatória" />
            <Field label="Nome do recebedor" name="pix_merchant" value={c.pix.merchant} hint="Até 25 caracteres, como no banco" />
            <Field label="Cidade" name="pix_city" value={c.pix.city} hint="Até 15 caracteres" />
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="font-semibold">Layout CNAB 400 do banco</h2>
          <p className="text-sm text-slate-500">Posições do registro de detalhe (1 a 400) conforme o manual de retorno do banco. O CNAB 240 segue o padrão FEBRABAN e não precisa de ajuste.</p>
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
                  <span className="text-slate-400">a</span>
                  <input className="input" name={`${k}_fim`} defaultValue={b} aria-label={`${l}: fim`} />
                </div>
              </div>
            ))}
          </div>
          <Field label="Códigos de liquidação" name="cnab_codigos" value={c.cnab400.codigosLiquidacao.join(", ")} hint="Ocorrências que significam pagamento (ex.: 06, 08, 10)" />
        </section>

        <section className="card space-y-4">
          <h2 className="font-semibold">Política de crédito</h2>
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Comprometimento máximo" name="cr_max" value={P(c.credit.maxCommitment)} suffix="% da renda" />
            <Field label="Comprometimento de atenção" name="cr_warn" value={P(c.credit.warnCommitment)} suffix="% da renda" />
            <Field label="Score para aprovar" name="cr_approve" value={c.credit.approveScore} hint="0 a 1000" />
            <Field label="Score abaixo do qual recusa" name="cr_reject" value={c.credit.rejectScore} />
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="font-semibold">Política de cobrança</h2>
          <div className="grid gap-4 md:grid-cols-5">
            <Field label="Multa" name="co_multa" value={P(c.collection.multa)} suffix="%" hint="Máximo 2% (CDC)" />
            <Field label="Juros de mora" name="co_juros" value={P(c.collection.jurosMes)} suffix="% a.m." />
            <Field label="Piso do acordo" name="co_floor" value={P(c.collection.floorPct)} suffix="% do original" />
            <Field label="Parcela mínima" name="co_min" value={c.collection.minInstallment} suffix="R$" />
            <Field label="Validade da proposta" name="co_validade" value={c.collection.validityDays} suffix="dias" />
          </div>
          <div className="overflow-x-auto">
            <table className="table">
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

        <section className="card space-y-4">
          <h2 className="font-semibold">Monitoramento de PLD</h2>
          <p className="text-sm text-slate-500">Calibre com o perfil da sua carteira e documente a escolha na Avaliação Interna de Risco (Circular 3.978, art. 10).</p>
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

        <SubmitButton pending="Salvando...">Salvar configurações</SubmitButton>
      </form>

      <section className="card mt-6 space-y-3">
        <h2 className="font-semibold">Baixa automática do Pix (webhook)</h2>
        <p className="text-sm text-slate-600">
          Cadastre esta URL no seu banco/PSP como webhook da chave Pix. Cada Pix recebido de um acordo é baixado automaticamente, sem digitação. O mesmo Pix nunca é baixado duas vezes.
        </p>
        {webhookUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs">{webhookUrl.replace(c.pix.webhookSecret, "••••••••")}</code>
            <CopyButton text={webhookUrl} label="Copiar URL completa" />
          </div>
        ) : (
          <p className="text-sm text-amber-700">Nenhum segredo gerado ainda: o webhook está desligado.</p>
        )}
        <form action={rotateWebhookSecret}>
          <SubmitButton pending="Gerando...">{webhookUrl ? "Gerar novo segredo (invalida o anterior)" : "Ativar webhook"}</SubmitButton>
        </form>
      </section>

      <section className="card mt-6 space-y-4">
        <h2 className="font-semibold">Listas restritivas e PEP</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Lista</th><th>Onde obter</th><th>Registros</th><th>Atualizada em</th></tr></thead>
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
                    <td className="text-slate-600">{where}</td>
                    <td>{l?._count ?? 0}</td>
                    <td className="text-slate-500">{l?._max.importedAt ? dt(l._max.importedAt) : "nunca"}</td>
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
        <p className="text-xs text-slate-500">Atualize as listas de sanções ao menos semanalmente: a Lei 13.810/2019 exige cumprimento imediato das resoluções do CSNU.</p>
      </section>
    </>
  );
}
