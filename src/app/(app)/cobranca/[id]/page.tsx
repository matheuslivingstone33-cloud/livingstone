import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, day, dt } from "@/lib/format";
import { debtStatus, updateDebt, type Option } from "@/lib/collection";
import { getSettings } from "@/lib/settings";
import { generateProposal, registerPayment } from "../../../actions-cobranca";
import { PageTitle, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";

const agStatus: Record<string, string> = {
  PROPOSTO: "bg-amber-100 text-amber-800",
  ACEITO: "bg-blue-100 text-blue-800",
  PAGO: "bg-emerald-100 text-emerald-800",
  CANCELADO: "bg-slate-100 text-slate-500",
};

export default async function DebtDetail({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const d = await db.debt.findFirst({ where: { id, orgId: s.orgId }, include: { agreements: { orderBy: { createdAt: "desc" } } } });
  if (!d) notFound();
  const upd = updateDebt(Number(d.principal), d.dueDate, new Date(), (await getSettings(s.orgId)).collection);
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const canEdit = s.role !== "AUDITOR";
  const waPhone = d.phone?.replace(/\D/g, "");

  return (
    <>
      <PageTitle
        title={`${d.debtor} · contrato ${d.contract}`}
        subtitle={`${d.document}${d.product ? ` · ${d.product}` : ""}${d.phone ? ` · ${d.phone}` : ""}${d.email ? ` · ${d.email}` : ""}`}
        action={<span className={`badge ${debtStatus[d.status][1]}`}>{debtStatus[d.status][0]}</span>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Valor original" value={brl(d.principal)} />
        <Stat label="Vencimento" value={day(d.dueDate)} />
        <Stat label="Dias em atraso" value={upd.days} tone="amber" />
        <Stat label="Multa + juros" value={brl(upd.multa + upd.juros)} tone="red" />
        <Stat label="Dívida atualizada" value={brl(upd.total)} tone="red" />
      </div>

      {canEdit && (d.status === "EM_ABERTO" || d.status === "NEGOCIANDO") && (
        <form action={generateProposal.bind(null, d.id)} className="mb-4">
          <SubmitButton pending="Gerando...">{d.agreements.length ? "Gerar nova proposta" : "Gerar proposta"}</SubmitButton>
        </form>
      )}

      <div className="space-y-4">
        {d.agreements.map((a) => {
          const options = a.options as unknown as Option[];
          const link = `${base}/acordo/${a.token}`;
          return (
            <div key={a.id} className={`card ${a.status === "CANCELADO" ? "opacity-60" : ""}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  Proposta de {dt(a.createdAt)} <span className={`badge ml-2 ${agStatus[a.status]}`}>{a.status}</span>
                </h2>
                <span className="text-xs text-slate-500">
                  Válida até {dt(a.expiresAt)} · mensagem: {a.aiProvider === "claude" ? "Claude" : "modelo padrão"}
                </span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <table className="table">
                    <thead><tr><th>Opção</th><th>Desconto</th><th>Total</th><th>Parcela</th></tr></thead>
                    <tbody>
                      {options.map((o) => {
                        const chosen = a.status !== "PROPOSTO" && a.installments === o.installments;
                        return (
                          <tr key={o.label} className={chosen ? "bg-blue-50 font-semibold" : ""}>
                            <td>{o.label}{chosen && " ✓"}</td>
                            <td>{o.discountPct.toFixed(1)}%</td>
                            <td>{brl(o.total)}</td>
                            <td>{brl(o.installment)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {a.paidAmount && (
                    <div className="mt-3 text-sm">
                      <div className="mb-1 flex justify-between">
                        <span className={a.status === "PAGO" ? "text-emerald-700" : "text-slate-600"}>
                          {a.status === "PAGO" ? "Acordo quitado" : "Recebido até agora"}: {brl(a.paidAmount)} de {brl(a.total)}
                        </span>
                        <span className="text-xs text-slate-400">último em {dt(a.paidAt)}</span>
                      </div>
                      <div className="h-2 rounded bg-slate-100">
                        <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(100, (Number(a.paidAmount) / Number(a.total)) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                  {canEdit && a.status === "ACEITO" && (
                    <form action={registerPayment.bind(null, a.id)} className="mt-3 flex items-end gap-2">
                      <div>
                        <label className="label" htmlFor={`amount-${a.id}`}>Valor recebido</label>
                        <input className="input" id={`amount-${a.id}`} name="amount" defaultValue={Number(a.installments === 1 ? a.total : a.installment).toFixed(2).replace(".", ",")} />
                      </div>
                      <SubmitButton pending="Salvando...">Registrar pagamento</SubmitButton>
                    </form>
                  )}
                </div>
                {a.status !== "CANCELADO" && (
                  <div className="space-y-2">
                    <div className="label">Mensagem para o devedor</div>
                    <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">{a.message}</pre>
                    <div className="flex flex-wrap gap-2">
                      <CopyButton text={a.message} label="Copiar mensagem" />
                      <CopyButton text={link} label="Copiar link" />
                      {waPhone && (
                        <a className="btn-ghost" target="_blank" rel="noreferrer" href={`https://wa.me/55${waPhone}?text=${encodeURIComponent(a.message)}`}>
                          Abrir no WhatsApp
                        </a>
                      )}
                      <a className="btn-ghost" href={link} target="_blank" rel="noreferrer">Ver página do devedor</a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
