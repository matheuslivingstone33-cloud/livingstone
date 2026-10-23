import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day, dt } from "@/lib/format";
import { nextInstallment, updateDebt, type Option } from "@/lib/collection";
import { getSettings } from "@/lib/settings";
import { generateProposal, registerPayment } from "../../../actions-cobranca";
import { PageTitle, Stat, StatusBadge, Notice, Badge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AI_PENDING, SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";
import { AiVersion } from "@/components/AiVersion";
import { ETAPA_LABEL } from "@/lib/regua";
import { MSG_LABEL, MSG_TONE, motivoLabel } from "@/lib/regua-rotulos";
import { pausarRegua, retomarRegua } from "../../../actions-regua";

// Tempo máximo da função na Vercel (actions e exportações longas)
export const maxDuration = 60;

export default async function DebtDetail({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const d = await db.debt.findFirst({ where: { id, orgId: s.orgId }, include: { agreements: { orderBy: { createdAt: "desc" } }, collectionMessages: { orderBy: { createdAt: "desc" }, take: 30 } } });
  if (!d) notFound();
  const upd = updateDebt(Number(d.principal), d.dueDate, new Date(), (await getSettings(s.orgId)).collection);
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const canEdit = s.role !== "AUDITOR";
  const waPhone = d.phone?.replace(/\D/g, "");

  return (
    <>
      <PageTitle
        back={{ href: "/cobranca", label: "Carteira de cobrança" }}
        title={`${d.debtor} · contrato ${d.contract}`}
        subtitle={`${d.document}${d.product ? ` · ${d.product}` : ""}${d.phone ? ` · ${d.phone}` : ""}${d.email ? ` · ${d.email}` : ""}`}
        action={<StatusBadge status={d.status} />}
      />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-5">
        <Stat label="Valor original" value={brl(d.principal)} />
        <Stat label="Vencimento" value={day(d.dueDate)} />
        <Stat label="Dias em atraso" value={upd.days} tone="amber" />
        <Stat label="Multa + juros" value={brl(upd.multa + upd.juros)} tone="red" />
        <Stat label="Dívida atualizada" value={brl(upd.total)} tone="red" />
      </div>

      {canEdit && (d.status === "EM_ABERTO" || d.status === "NEGOCIANDO") && (
        <form action={generateProposal.bind(null, d.id)} className="mb-6">
          <SubmitButton pending="Gerando..." hint={AI_PENDING}>{d.agreements.length ? "Gerar nova proposta" : "Gerar proposta"}</SubmitButton>
        </form>
      )}

      <section className="card mb-6 space-y-3" aria-labelledby="regua-contrato">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="regua-contrato" className="card-title flex flex-wrap items-center gap-2">
              Régua de cobrança
              {d.reguaPausedAt ? (
                <Badge tone="warning">{d.reguaPauseReason === "opt_out" ? "Devedor pediu para não receber" : "Pausada"}</Badge>
              ) : (
                <Badge tone="success">Ativa para este contrato</Badge>
              )}
            </h2>
            {d.reguaPausedAt && (
              <p className="mt-1 text-xs text-ink-500">
                Desde {dt(d.reguaPausedAt)}{d.reguaPausedBy ? ` por ${d.reguaPausedBy}` : ""}. Nenhuma mensagem automática sai para este contrato.
              </p>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {d.reguaPausedAt ? (
                <form action={retomarRegua.bind(null, d.id)}>
                  <SubmitButton pending="Retomando...">Retomar régua</SubmitButton>
                </form>
              ) : (
                <>
                  <form action={pausarRegua.bind(null, d.id, "pausa")}>
                    <SubmitButton pending="Pausando...">Pausar régua</SubmitButton>
                  </form>
                  <form action={pausarRegua.bind(null, d.id, "opt_out")}>
                    <SubmitButton pending="Salvando...">Devedor pediu para não receber</SubmitButton>
                  </form>
                </>
              )}
            </div>
          )}
        </div>
        {d.collectionMessages.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Quando</th><th>Etapa</th><th>Situação</th><th className="num">Tentativas</th><th>Detalhe</th></tr></thead>
              <tbody>
                {d.collectionMessages.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-ink-500">{dt(m.sentAt ?? m.updatedAt)}</td>
                    <td>{ETAPA_LABEL[m.etapa] ?? m.etapa}</td>
                    <td><Badge tone={MSG_TONE[m.status] ?? "neutral"}>{MSG_LABEL[m.status] ?? m.status}</Badge></td>
                    <td className="num">{m.tentativas}</td>
                    <td className="text-xs text-ink-500">{motivoLabel(m.motivo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-500">Nenhum envio automático para este contrato ainda.</p>
        )}
      </section>

      <div className="space-y-4">
        {d.agreements.map((a) => {
          const options = a.options as unknown as Option[];
          const link = `${base}/acordo/${a.token}`;
          return (
            <section key={a.id} className={`card ${a.status === "CANCELADO" ? "opacity-60" : ""}`}>
              <div className="card-header items-center">
                <h2 className="card-title flex flex-wrap items-center gap-2">
                  Proposta de {dt(a.createdAt)} <StatusBadge status={a.status} />
                </h2>
                <span className="text-xs text-ink-500">
                  Válida até {dt(a.expiresAt)} · mensagem: {a.aiProvider === "claude" ? "Claude" : "modelo padrão"}
                </span>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="min-w-0">
                  <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Opção</th><th className="num">Desconto</th><th className="num">Total</th><th className="num">Parcela</th></tr></thead>
                    <tbody>
                      {options.map((o) => {
                        const chosen = a.status !== "PROPOSTO" && a.installments === o.installments;
                        return (
                          <tr key={o.label} className={chosen ? "bg-brand-50 font-semibold text-brand-900" : ""}>
                            <td>
                              <span className="inline-flex items-center gap-1.5">
                                {o.label}
                                {chosen && <Icon name="check" size={14} strokeWidth={2.5} className="text-brand-700" />}
                                {chosen && <span className="sr-only">(escolhida)</span>}
                              </span>
                            </td>
                            <td className="num">{o.discountPct.toFixed(1)}%</td>
                            <td className="num">{brl(o.total)}</td>
                            <td className="num">{brl(o.installment)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                  {a.paidAmount && (
                    <div className="mt-4 rounded-xl border border-line bg-paper/60 p-3 text-sm">
                      <div className="mb-2 flex flex-wrap justify-between gap-2">
                        <span className={a.status === "PAGO" ? "font-medium text-emerald-800" : "text-ink-700"}>
                          {a.status === "PAGO" ? "Acordo quitado" : "Recebido até agora"}: {brl(a.paidAmount)} de {brl(a.total)}
                        </span>
                        <span className="text-xs text-ink-500">último em {dt(a.paidAt)}</span>
                      </div>
                      {Number(a.paidAmount) > Number(a.total) + 0.01 && (
                        <Notice tone="warning" className="mb-2 py-2 text-xs">
                          Pago a maior: {brl(Number(a.paidAmount) - Number(a.total))}. Verificar devolução ao devedor.
                        </Notice>
                      )}
                      <div className="h-2 overflow-hidden rounded-full bg-paper-2">
                        <div className="grow-x h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (Number(a.paidAmount) / Number(a.total)) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                  {canEdit && a.status === "ACEITO" && (
                    <form action={registerPayment.bind(null, a.id)} className="mt-4 flex flex-wrap items-end gap-2">
                      <div className="min-w-40 flex-1">
                        <label className="label" htmlFor={`amount-${a.id}`}>Valor recebido</label>
                        <input className="input" id={`amount-${a.id}`} name="amount" defaultValue={(nextInstallment(Number(a.total), a.installments, Number(a.installment), Number(a.paidAmount ?? 0))?.amount ?? 0).toFixed(2).replace(".", ",")} />
                      </div>
                      <SubmitButton pending="Salvando...">Registrar pagamento</SubmitButton>
                    </form>
                  )}
                </div>
                {a.status !== "CANCELADO" && (
                  <div className="min-w-0 space-y-3">
                    <div className="eyebrow">Mensagem para o devedor</div>
                    <pre className="whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-line bg-paper p-4 font-sans text-sm leading-relaxed text-ink-800">{a.message}</pre>
                    <AiVersion status={a.aiStatus} base={a.messageBase} label="Ver mensagem padrão (sem IA)" />
                    <div className="flex flex-wrap gap-2">
                      <CopyButton text={a.message} label="Copiar mensagem" />
                      <CopyButton text={link} label="Copiar link" />
                      {waPhone && (
                        <a className="btn-ghost" target="_blank" rel="noreferrer" href={`https://wa.me/55${waPhone}?text=${encodeURIComponent(a.message)}`}>
                          <Icon name="whatsapp" size={16} />
                          Abrir no WhatsApp
                        </a>
                      )}
                      <a className="btn-ghost" href={link} target="_blank" rel="noreferrer"><Icon name="external" size={16} />Ver página do devedor</a>
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
