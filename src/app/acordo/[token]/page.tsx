import QRCode from "qrcode";
import { db } from "@/lib/db";
import { brl, day } from "@/lib/format";
import { pixPayload, pixTxid, type Option } from "@/lib/collection";
import { getSettings } from "@/lib/settings";
import { acceptAgreement } from "../../actions-cobranca";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Proposta de acordo", robots: { index: false } };

// Exibe apenas o necessário (LGPD): primeiro nome e documento mascarado
const maskDoc = (doc: string) => {
  const d = doc.replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : `**.${d.slice(2, 5)}.***/****-${d.slice(12)}`;
};

function Shell({ org, children }: { org?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <div className="text-center">
          <div className="text-lg font-bold text-brand-900">{org ?? "Proposta de acordo"}</div>
          <div className="text-xs text-slate-500">Ambiente seguro de negociação</div>
        </div>
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
        <div className="card text-center text-sm text-slate-600">Esta proposta não está mais disponível. Entre em contato com a instituição.</div>
      </Shell>
    );

  const d = a.debt;
  const first = d.debtor.split(" ")[0];
  const options = a.options as unknown as Option[];
  const expired = a.status === "PROPOSTO" && a.expiresAt < new Date();

  if (a.status === "PROPOSTO" && !expired)
    return (
      <Shell org={d.org.name}>
        <div className="card space-y-1">
          <p className="text-lg">Olá, <b>{first}</b>!</p>
          <p className="text-sm text-slate-600">
            Contrato <b>{d.contract}</b>{d.product && ` (${d.product})`} · CPF/CNPJ {maskDoc(d.document)}
          </p>
          <p className="text-sm text-slate-600">
            Vencido em {day(d.dueDate)} · valor atualizado <b>{brl(a.updatedDebt)}</b>
          </p>
        </div>
        <form action={acceptAgreement.bind(null, token)} className="card space-y-3">
          <h1 className="font-semibold">Escolha como prefere pagar</h1>
          {options.map((o, i) => (
            <label key={o.label} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="option" value={i} defaultChecked={o.installments === a.installments} className="accent-brand-600" />
              <div className="flex-1">
                <div className="font-medium">
                  {o.installments === 1 ? `À vista: ${brl(o.total)}` : `${o.installments}x de ${brl(o.installment)}`}
                </div>
                <div className="text-xs text-slate-500">
                  Total {brl(o.total)}{o.discountPct > 0 && <span className="text-emerald-700"> · {o.discountPct.toFixed(0)}% de desconto</span>}
                </div>
              </div>
            </label>
          ))}
          <SubmitButton pending="Confirmando...">Aceitar acordo</SubmitButton>
          <p className="text-center text-xs text-slate-500">Proposta válida até {day(a.expiresAt)}.</p>
        </form>
      </Shell>
    );

  if (expired)
    return (
      <Shell org={d.org.name}>
        <div className="card text-center text-sm text-slate-600">Esta proposta expirou em {day(a.expiresAt)}. Fale com a instituição para receber uma nova.</div>
      </Shell>
    );

  if (a.status === "PAGO")
    return (
      <Shell org={d.org.name}>
        <div className="card text-center">
          <div className="text-3xl">✓</div>
          <p className="font-semibold text-emerald-700">Pagamento recebido. Obrigado, {first}!</p>
          <p className="text-sm text-slate-500">Valor: {brl(a.paidAmount)}</p>
        </div>
      </Shell>
    );

  // ACEITO: mostra o Pix da próxima parcela (ou do valor à vista)
  const paid = Number(a.paidAmount ?? 0);
  const nth = Math.min(a.installments, Math.floor((paid + 0.01) / Number(a.installment)) + 1);
  const amount = Math.round(Math.min(Number(a.installment), Number(a.total) - paid) * 100) / 100;
  const pix = pixPayload(amount, pixTxid(a.token, nth), `Acordo ${d.contract}`, (await getSettings(d.orgId)).pix);
  const qr = pix ? await QRCode.toDataURL(pix, { margin: 1, width: 240 }) : null;

  return (
    <Shell org={d.org.name}>
      <div className="card space-y-1 text-center">
        <p className="font-semibold text-emerald-700">Acordo confirmado!</p>
        <p className="text-sm text-slate-600">
          {a.installments === 1 ? `Pagamento à vista de ${brl(a.total)}` : `${a.installments} parcelas de ${brl(a.installment)} (total ${brl(a.total)})`}
        </p>
      </div>
      <div className="card space-y-3 text-center">
        <h1 className="font-semibold">
          Pague {a.installments === 1 ? "" : `a ${nth}ª parcela (de ${a.installments}) `}com Pix: {brl(amount)}
        </h1>
        {pix && qr ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR Code Pix" className="mx-auto h-60 w-60" />
            <p className="break-all rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-600">{pix}</p>
            <CopyButton text={pix} label="Copiar código Pix" />
          </>
        ) : (
          <p className="text-sm text-amber-700">Pix indisponível no momento. Entre em contato com a instituição.</p>
        )}
        {a.installments > 1 && <p className="text-xs text-slate-500">As próximas parcelas serão enviadas mensalmente.</p>}
      </div>
    </Shell>
  );
}
