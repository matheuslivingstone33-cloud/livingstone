import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day } from "@/lib/format";
import { bandOf, DEBT_STATUSES, updateDebt } from "@/lib/collection";
import { getSettings } from "@/lib/settings";
import { importDebts, generateAllProposals, generateProposal } from "../../actions-cobranca";
import { PageTitle, Stat, EmptyHelp, Notice, CardHeader, TableCard, FilterBar, StatusBadge, statusLabel, Badge, Empty } from "@/components/ui";
import { AI_PENDING, SubmitButton } from "@/components/SubmitButton";
import { FileSizeGuard } from "@/components/FileSizeGuard";
import { AjudaAba } from "@/components/AjudaAba";
import { AJUDA } from "@/lib/ajuda";
import { dt } from "@/lib/format";
import { ETAPA_LABEL, ehExcecao, etapaConcluida, proximaEtapa, type Etapa } from "@/lib/regua";
import { MSG_LABEL, MSG_TONE, motivoLabel } from "@/lib/regua-rotulos";
import { evolutionConfig } from "@/lib/evolution";
import { executarReguaAgora } from "../../actions-regua";

// Tempo máximo da função na Vercel (actions e exportações longas)
export const maxDuration = 60;

export default async function CobrancaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; importados?: string; propostas?: string; falhas?: string; restantes?: string; bloqueadas?: string; regua?: string; r_env?: string; r_prop?: string; r_falhas?: string; r_rest?: string }>;
}) {
  const s = await requireSession();
  const { status, importados, propostas, falhas, restantes, bloqueadas, regua, r_env, r_prop, r_falhas, r_rest } = await searchParams;
  const intParam = (v?: string) => Math.max(0, Math.floor(Number(v) || 0));
  const nFalhas = intParam(falhas);
  const nBloqueadas = intParam(bloqueadas);
  const all = await db.debt.findMany({
    where: { orgId: s.orgId },
    orderBy: { dueDate: "asc" },
    include: { agreements: { orderBy: { createdAt: "desc" }, take: 1, include: { collectionMessages: { select: { etapa: true, status: true, motivo: true, tentativas: true } } } } },
  });
  const settings = await getSettings(s.orgId);
  const cfg = settings.collection;
  const rg = settings.regua;
  const envioLigado = evolutionConfig(process.env) !== null;
  const now = new Date();
  const [ultimosEnvios, excecoesRecentes] = await Promise.all([
    db.collectionMessage.findMany({ where: { orgId: s.orgId }, orderBy: { updatedAt: "desc" }, take: 20, include: { debt: { select: { id: true, contract: true, debtor: true } } } }),
    db.collectionMessage.findMany({
      where: { orgId: s.orgId, OR: [{ status: "FALHOU" }, { status: "IGNORADO", motivo: "telefone_invalido" }] },
      orderBy: { updatedAt: "desc" },
      take: 40,
      include: { debt: { select: { id: true, contract: true, debtor: true } } },
    }),
  ]);
  const excecoes = excecoesRecentes.filter(ehExcecao).slice(0, 10);
  const proxima = (d: (typeof all)[number]) => {
    const a = d.agreements[0];
    if (!a || a.status !== "PROPOSTO" || a.expiresAt <= now) return null;
    if (d.reguaPausedAt) return d.reguaPauseReason === "opt_out" ? "Não quer receber" : "Pausada";
    if (!rg.ativa) return null;
    const p = proximaEtapa(a, rg.etapas as Etapa[], a.collectionMessages.filter(etapaConcluida).map((m) => m.etapa), now);
    return p ? `${ETAPA_LABEL[p.etapa.id] ?? p.etapa.id} ${p.emDias === 0 ? "hoje" : `em ${p.emDias} dia(s)`}` : "Concluída";
  };
  const BANDS = cfg.bands;
  const rows = all.map((d) => ({ ...d, upd: updateDebt(Number(d.principal), d.dueDate, new Date(), cfg) }));
  const list = status ? rows.filter((d) => d.status === status) : rows;

  const open = rows.filter((d) => d.status !== "QUITADO");
  const carteira = open.reduce((a, d) => a + d.upd.total, 0);
  const recovered = await db.agreement.aggregate({ where: { debt: { orgId: s.orgId } }, _sum: { paidAmount: true } });
  const acordos = rows.filter((d) => d.status === "ACORDO" || d.status === "QUITADO").length;
  const enviados = rows.filter((d) => d.status !== "EM_ABERTO").length;
  const byBand = BANDS.map((b) => {
    const ds = open.filter((d) => bandOf(d.upd.days, BANDS).label === b.label && d.upd.days > 0);
    return { ...b, count: ds.length, total: ds.reduce((a, d) => a + d.upd.total, 0) };
  });
  const maxBand = Math.max(...byBand.map((b) => b.total), 1);
  const canEdit = s.role !== "AUDITOR";
  // Restantes vem da URL, mas o banner só aparece se ainda houver contratos em aberto de verdade
  const emAberto = rows.filter((d) => d.status === "EM_ABERTO").length;
  const nRestantes = Math.min(intParam(restantes), emAberto);

  return (
    <>
      <PageTitle
        eyebrow="Cobrança"
        title="Cobrança e renegociação"
        subtitle="Dívida atualizada (multa 2% + juros de 1% a.m.), propostas por faixa de atraso e acordo com pagamento via Pix"
        action={
          canEdit && rows.some((d) => d.status === "EM_ABERTO") ? (
            <form action={generateAllProposals}>
              <SubmitButton pending="Gerando propostas..." hint={AI_PENDING}>Gerar propostas para todos em aberto</SubmitButton>
            </form>
          ) : undefined
        }
      />
      <AjudaAba aba="cobranca" />
      {(importados || propostas) && (
        <Notice>{importados ? `${importados} contrato(s) importado(s).` : `${propostas} proposta(s) gerada(s).`}</Notice>
      )}
      {propostas && nFalhas > 0 && (
        <Notice tone="warning">
          {nFalhas} contrato(s) com falha da IA ou erro no lote: as propostas geradas usaram a mensagem padrão. Os contratos com erro continuam em aberto; detalhes na auditoria.
        </Notice>
      )}

      {propostas && nBloqueadas > 0 && (
        <Notice tone="info">
          O teto diário de IA da instituição foi atingido: {nBloqueadas} proposta(s) saíram com a mensagem padrão, sem IA. O limite pode ser ajustado em Configurações.
        </Notice>
      )}
      {canEdit && nRestantes > 0 && (
        <Notice tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {nRestantes} contrato(s) ainda sem proposta. A geração para em cerca de 45 segundos por vez para não estourar o tempo do servidor.
            </span>
            <form action={generateAllProposals}>
              <SubmitButton pending="Gerando propostas..." hint={AI_PENDING}>Continuar gerando</SubmitButton>
            </form>
          </div>
        </Notice>
      )}

      {regua && (
        <Notice tone={intParam(r_falhas) ? "warning" : "success"}>
          Régua executada: {intParam(r_prop)} proposta(s) gerada(s), {intParam(r_env)} mensagem(ns) enviada(s){intParam(r_falhas) ? `, ${intParam(r_falhas)} falha(s)` : ""}.
          {r_rest === "1" ? " Ficaram contratos para a próxima execução (limite de tempo ou de envios por vez)." : ""}
        </Notice>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Stat label="Carteira em atraso (atualizada)" value={brl(carteira)} tone="red" />
        <Stat label="Contratos" value={rows.length} />
        <Stat label="Taxa de acordo" value={enviados ? `${Math.round((acordos / enviados) * 100)}%` : "—"} tone="blue" />
        <Stat label="Recuperado" value={brl(recovered._sum.paidAmount ?? 0)} tone="green" />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <CardHeader title="Carteira por faixa de atraso">Valor atualizado (contratos)</CardHeader>
          <ul className="space-y-3">
            {byBand.map((b) => (
              <li key={b.label} className="grid grid-cols-[minmax(84px,110px)_1fr] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[110px_1fr_auto]">
                <span className="text-ink-600">{b.label}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-paper-2 max-sm:order-last max-sm:col-span-2">
                  <div className="grow-x h-full rounded-full bg-brand-600" style={{ width: `${(b.total / maxBand) * 100}%` }} />
                </div>
                <span className="text-right font-medium tabular-nums text-ink-900 sm:w-40">
                  {brl(b.total)} <span className="font-normal text-ink-500">({b.count})</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-line pt-3 text-xs leading-relaxed text-ink-500">
            Política: à vista {BANDS.map((b) => `${b.label.split(" ")[0]} −${Math.round(b.cash * 100)}%`).join(" · ")}. O acordo nunca fica abaixo de {Math.round(cfg.floorPct * 100)}% do valor original. Ajuste em Configurações.
          </p>
        </section>
        {canEdit && (
          <form action={importDebts} className="card space-y-3">
            <CardHeader title="Importar carteira" />
            <input className="input" id="debts-file" name="file" type="file" accept=".csv,.txt" required />
            <p className="hint mt-1">Até 4 MB por envio.</p>
            <FileSizeGuard inputIds={["debts-file"]} />
            <p className="hint mt-0">CSV com: contrato; devedor; cpf_cnpj; telefone; email; produto; valor; vencimento</p>
            <SubmitButton pending="Importando...">Importar</SubmitButton>
          </form>
        )}
      </div>

      <section className="card mb-8 space-y-4" id="regua" aria-labelledby="regua-titulo">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="regua-titulo" className="card-title flex flex-wrap items-center gap-2">
              Régua de cobrança
              {rg.ativa ? <Badge tone="success">Ligada</Badge> : <Badge tone="muted">Desligada</Badge>}
              {!envioLigado && <Badge tone="warning">Envio desligado</Badge>}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-500">
              {rg.ativa
                ? `Em dias úteis, das ${rg.horaInicio}h às ${rg.horaFim}h (Brasília), gera a proposta dos contratos em aberto e envia por WhatsApp: ${rg.etapas.map((e) => `${(ETAPA_LABEL[e.id] ?? e.id).toLowerCase()} no dia ${e.dias}`).join(", ")}. No máximo uma mensagem por devedor por dia.`
                : "Desligada: nenhuma mensagem sai automaticamente. Um administrador pode ligar em Configurações."}
            </p>
            {!envioLigado && (
              <p className="mt-1 text-sm text-ink-700">O WhatsApp não está configurado no servidor: a régua registra as etapas, mas não envia nada.</p>
            )}
          </div>
          {canEdit && rg.ativa && (
            <form action={executarReguaAgora}>
              <SubmitButton pending="Executando..." hint="Gerando propostas e enviando mensagens, leva alguns segundos">Executar régua agora</SubmitButton>
            </form>
          )}
        </div>
        {excecoes.length > 0 && (
          <div>
            <h3 className="eyebrow mb-2">Exceções para olhar</h3>
            <ul className="space-y-1 text-sm">
              {excecoes.map((m) => (
                <li key={m.id} className="flex flex-wrap justify-between gap-x-4">
                  <span className="min-w-0">
                    <Link className="link-action font-mono text-xs" href={`/cobranca/${m.debt.id}`}>{m.debt.contract}</Link> · {m.debt.debtor} · {ETAPA_LABEL[m.etapa] ?? m.etapa}: {motivoLabel(m.motivo)}
                  </span>
                  <span className="text-xs tabular-nums text-ink-500">{dt(m.updatedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h3 className="eyebrow mb-2">Últimos envios</h3>
          {ultimosEnvios.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Quando</th><th>Contrato</th><th>Etapa</th><th>Situação</th><th>Detalhe</th></tr></thead>
                <tbody>
                  {ultimosEnvios.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-ink-500">{dt(m.sentAt ?? m.updatedAt)}</td>
                      <td><Link className="link-action font-mono text-xs" href={`/cobranca/${m.debt.id}`}>{m.debt.contract}</Link></td>
                      <td>{ETAPA_LABEL[m.etapa] ?? m.etapa}</td>
                      <td><Badge tone={MSG_TONE[m.status] ?? "neutral"}>{MSG_LABEL[m.status] ?? m.status}</Badge></td>
                      <td className="text-xs text-ink-500">{motivoLabel(m.motivo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nenhum envio da régua ainda.</Empty>
          )}
        </div>
      </section>

      <FilterBar label="Filtrar contratos por situação">
        {[["", "Todos"], ...DEBT_STATUSES.map((k) => [k, statusLabel(k)])].map(([k, label]) => (
          <Link key={k} href={k ? `?status=${k}` : "?"} aria-current={(status ?? "") === k ? "page" : undefined} className="chip">
            {label}
          </Link>
        ))}
      </FilterBar>
      <TableCard title="Contratos" meta={`${list.length} contrato(s)`}>
        {list.length ? (
          <table className="table">
            <thead>
              <tr><th>Contrato</th><th>Devedor</th><th>Produto</th><th className="num">Original</th><th>Vencimento</th><th className="num">Atraso</th><th className="num">Atualizado</th><th>Situação</th><th>Régua</th><th><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td><Link className="link-action font-mono text-xs" href={`/cobranca/${d.id}`}>{d.contract}</Link></td>
                  <td className="font-medium text-ink-900">{d.debtor}</td>
                  <td className="text-ink-500">{d.product ?? "—"}</td>
                  <td className="num">{brl(d.principal)}</td>
                  <td className="whitespace-nowrap">{day(d.dueDate)}</td>
                  <td className="num whitespace-nowrap">{d.upd.days} dias</td>
                  <td className="num font-semibold text-ink-900">{brl(d.upd.total)}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td className="whitespace-nowrap text-xs text-ink-500">{proxima(d) ?? "—"}</td>
                  <td>
                    {canEdit && d.status === "EM_ABERTO" && (
                      <form action={generateProposal.bind(null, d.id)}>
                        <SubmitButton variant="link" pending="Gerando..." hint={AI_PENDING}>Gerar proposta</SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyHelp {...AJUDA.cobranca.vazio} />
        )}
      </TableCard>
    </>
  );
}
