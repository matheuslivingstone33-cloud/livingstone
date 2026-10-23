"use client";

import { useActionState, useState } from "react";
import { decidirCredito, type DecisaoState } from "../../../actions-credito-decisao";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/ui";

const MIN = 30;

export function DecisaoForm({ analysisId, atual, revisao }: { analysisId: string; atual: string | null; revisao: boolean }) {
  const [state, action] = useActionState<DecisaoState, FormData>(decidirCredito.bind(null, analysisId), {});
  const [aberto, setAberto] = useState(!revisao);
  const [txt, setTxt] = useState("");
  const n = txt.trim().length;
  if (state.ok) return <p role="status" className="notice notice-success">{state.ok}</p>;
  if (!aberto) return <button type="button" className="btn-ghost" onClick={() => setAberto(true)}>Revisar decisão</button>;
  const opcoes = [["APROVADO", "Aprovar o crédito"], ["RECUSADO", "Recusar o crédito"]].filter(([v]) => !revisao || v !== atual);

  return (
    <form action={action} className="space-y-4">
      <fieldset className="grid gap-2">
        <legend className="label">{revisao ? "Nova decisão" : "Decisão"}</legend>
        {opcoes.map(([v, l]) => (
          <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3 py-2.5 text-sm hover:bg-paper has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
            <input type="radio" name="decision" value={v} required className="size-4 accent-brand-600" defaultChecked={revisao} />
            {l}
          </label>
        ))}
      </fieldset>
      <div>
        <label className="label" htmlFor="justification">Justificativa {revisao ? "da revisão " : ""}(fica registrada para auditoria)</label>
        <textarea className="input min-h-28" id="justification" name="justification" required minLength={MIN} value={txt} onChange={(e) => setTxt(e.target.value)} />
        <p className={`hint ${n >= MIN ? "text-emerald-700" : ""}`}>{n}/{MIN} caracteres mínimos</p>
      </div>
      {state.error && <Notice tone="danger" role="alert" className="mb-0 text-sm">{state.error}</Notice>}
      <SubmitButton pending="Registrando...">{revisao ? "Registrar revisão" : "Registrar decisão"}</SubmitButton>
    </form>
  );
}
