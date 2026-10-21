import QRCode from "qrcode";
import { db } from "@/lib/db";
import { brl, day, dayInst } from "@/lib/format";
import { nextInstallment, pixPayload, pixTxid, type Option } from "@/lib/collection";
import { getSettings } from "@/lib/settings";
import { acceptAgreement } from "../../actions-cobranca";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Proposta de acordo", robots: { index: false } };

// Exibe apenas o necessário (LGPD): primeiro nome e documento mascarado
const maskDoc = (doc: string) => {
  const d = doc.replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : `**.${d.slice(2, 5)}.***/****-${d.slice(12)}`;
};

function Shell({ org, children }: { org?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper text-ink-900">
      <div className="h-1.5 bg-brand-600" aria-hidden="true" />
      <div className="mx-auto max-w-md space-y-4 px-4 pb-12 pt-8">
        <header className="pb-2 text-center">
          <div className="font-display text-2xl font-semibold tracking-tight text-ink-900">{org ?? "Proposta de acordo"}</div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800">
            <Icon name="lock" size={13} strokeWidth={2} />
            Ambiente seguro de negociação
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

export default async function AcordoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await db.agreement.findUnique({ where: { token }, include: { debt: { include: { org: true } } } });
  if (!a || a.status === "CANCELADO")
    return (
      <Shell>
        <div className="card text-center text-base leading-relaxed text-ink-700">Esta proposta não está mais disponível. Entre em contato com a instituição.</div>
      </Shell>
    );

  const d = a.debt;
  const first = d.debtor.split(" ")[0];
  const options = a.options as unknown as Option[];
  const expired = a.status === "PROPOSTO" && a.expiresAt < new Date();

  if (a.status === "PROPOSTO" && !expired)
    return (
      <Shell org={d.org.name}>
        <div className="card space-y-3">
          <p className="text-xl">Olá, <b>{first}</b>!</p>
          <dl className="divide-y divide-line text-[15px]">
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-ink-500">Contrato</dt>
              <dd className="text-right font-medium">{d.contract}{d.product && ` (${d.product})`}</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-ink-500">CPF/CNPJ</dt>
              <dd className="font-mono text-sm">{maskDoc(d.document)}</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-ink-500">Vencido em</dt>
              <dd className="font-medium">{day(d.dueDate)}</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-ink-500">Valor atualizado</dt>
              <dd className="font-semibold tabular-nums">{brl(a.updatedDebt)}</dd>
            </div>
          </dl>
        </div>
        <form action={acceptAgreement.bind(null, token)} className="card space-y-3 [&_.btn]:min-h-12 [&_.btn]:w-full [&_.btn]:text-base">
          <h1 className="font-display text-xl font-semibold tracking-tight">Escolha como prefere pagar</h1>
          <fieldset className="space-y-3">
            <legend className="sr-only">Opções de pagamento</legend>
            {options.map((o, i) => (
              <label key={o.label} className="flex min-h-16 cursor-pointer items-center gap-4 rounded-2xl border-2 border-line bg-white p-4 transition-colors hover:border-line-strong has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 has-[:focus-visible]:ring-offset-2">
                <input type="radio" name="option" value={i} defaultChecked={o.installments === a.installments} className="size-5 shrink-0 accent-brand-600" />
                <div className="flex-1">
                  <div className="text-base font-semibold tabular-nums">
                    {o.installments === 1 ? `À vista: ${brl(o.total)}` : `${o.installments}x de ${brl(o.installment)}`}
                  </div>
                  <div className="mt-0.5 text-sm text-ink-500">
                    Total {brl(o.total)}{o.discountPct > 0 && <span className="font-medium text-emerald-700"> · {o.discountPct.toFixed(0)}% de desconto</span>}
                  </div>
                </div>
              </label>
            ))}
          </fieldset>
          <SubmitButton pending="Confirmando...">Aceitar acordo</SubmitButton>
          <p className="text-center text-sm text-ink-500">Proposta válida até {dayInst(a.expiresAt)}.</p>
        </form>
      </Shell>
    );

  if (expired)
    return (
      <Shell org={d.org.name}>
        <div className="card text-center text-base leading-relaxed text-ink-700">Esta proposta expirou em {dayInst(a.expiresAt)}. Fale com a instituição para receber uma nova.</div>
      </Shell>
    );

  if (a.status === "PAGO")
    return (
      <Shell org={d.org.name}>
        <div className="card space-y-3 py-10 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Icon name="check" size={32} strokeWidth={2.5} />
          </span>
          <p className="text-xl font-semibold text-emerald-800">Pagamento recebido. Obrigado, {first}!</p>
          <p className="text-base text-ink-600">
            Valor: <b className="tabular-nums">{brl(a.paidAmount)}</b>
          </p>
        </div>
      </Shell>
    );

  // ACEITO: mostra o Pix da próxima parcela (ou do valor à vista)
  const paid = Number(a.paidAmount ?? 0);
  const due = nextInstallment(Number(a.total), a.installments, Number(a.installment), paid);
  const nth = due?.nth ?? a.installments;
  const amount = due?.amount ?? 0;
  const pix = pixPayload(amount, pixTxid(a.token, nth), `Acordo ${d.contract}`, (await getSettings(d.orgId)).pix);
  const qr = pix ? await QRCode.toDataURL(pix, { margin: 1, width: 240 }) : null;

  return (
    <Shell org={d.org.name}>
      <div className="card flex items-center gap-4 border-emerald-200 bg-emerald-50">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Icon name="check" size={22} strokeWidth={2.5} />
        </span>
        <div>
        <p className="text-lg font-semibold text-emerald-900">Acordo confirmado!</p>
        <p className="text-sm text-emerald-900/80">
          {a.installments === 1 ? `Pagamento à vista de ${brl(a.total)}` : `${a.installments} parcelas de ${brl(a.installment)} (total ${brl(a.total)})`}
        </p>
        </div>
      </div>
      <div className="card space-y-4 text-center [&_.btn-ghost]:min-h-12 [&_.btn-ghost]:w-full [&_.btn-ghost]:border-brand-600 [&_.btn-ghost]:bg-brand-600 [&_.btn-ghost]:text-base [&_.btn-ghost]:font-semibold [&_.btn-ghost]:text-white [&_.btn-ghost:hover]:bg-brand-700">
        <h1 className="font-display text-xl font-semibold leading-snug tracking-tight">
          Pague {a.installments === 1 ? "" : `a ${nth}ª parcela (de ${a.installments}) `}com Pix: {brl(amount)}
        </h1>
        {pix && qr ? (
          <>
            <div className="mx-auto w-fit rounded-2xl border border-line bg-white p-3 shadow-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR Code Pix" className="h-64 w-64 max-w-full [image-rendering:pixelated]" />
            </div>
            <ol className="mx-auto max-w-xs space-y-1 text-left text-sm text-ink-600">
              <li><b className="text-ink-900">1.</b> Abra o app do seu banco e escolha Pix.</li>
              <li><b className="text-ink-900">2.</b> Leia o QR Code ou use “Pix Copia e Cola”.</li>
            </ol>
            <CopyButton text={pix} label="Copiar código Pix" />
            <p className="break-all rounded-xl border border-line bg-paper p-3 text-left font-mono text-xs leading-relaxed text-ink-600">{pix}</p>
          </>
        ) : (
          <p className="notice notice-warning mb-0 text-left text-base">Pix indisponível no momento. Entre em contato com a instituição.</p>
        )}
        {a.installments > 1 && <p className="text-sm text-ink-500">As próximas parcelas serão enviadas mensalmente.</p>}
      </div>
    </Shell>
  );
}
