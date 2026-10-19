"use client";

import { useActionState, useState } from "react";
import { decideCase, type DecideState } from "../../../actions-pld";
import { SubmitButton } from "@/components/SubmitButton";

export function DecisionForm({ caseId, mandatory, pepNeedsAdmin }: { caseId: string; mandatory: boolean; pepNeedsAdmin: boolean }) {
  const [state, action] = useActionState<DecideState, FormData>(decideCase.bind(null, caseId), {});
  const [decision, setDecision] = useState(mandatory ? "COMUNICADO" : "");
  // Campos controlados: o texto não se perde se a validação do servidor recusar o envio
  const [justification, setJustification] = useState("");
  const [protocol, setProtocol] = useState("");

  return (
    <form action={action} className="card space-y-4 border-ink-900/15 ring-1 ring-gold-400/30">
      <div className="card-header">
        <h2 className="card-title">Decisão do analista</h2>
        <span className="text-xs text-ink-500">Fica registrada na trilha de auditoria</span>
      </div>
      {pepNeedsAdmin && (
        <p className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">Cliente PEP: somente um Administrador pode registrar a decisão.</p>
      )}
      <fieldset className="grid gap-2">
        <legend className="label">Encaminhamento</legend>
        <label className={`flex min-h-11 items-center gap-3 rounded-xl border border-line-strong px-3 py-2.5 text-sm transition-colors has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 ${mandatory ? "opacity-50" : "cursor-pointer hover:bg-paper"}`}>
          <input type="radio" name="decision" value="ARQUIVADO" disabled={mandatory} checked={decision === "ARQUIVADO"} onChange={() => setDecision("ARQUIVADO")} className="size-4 accent-brand-600" />
          Arquivar (sem indícios após análise)
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3 py-2.5 text-sm transition-colors hover:bg-paper has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600">
          <input type="radio" name="decision" value="COMUNICADO" checked={decision === "COMUNICADO"} onChange={() => setDecision("COMUNICADO")} className="size-4 accent-brand-600" />
          Comunicar ao COAF
        </label>
      </fieldset>
      <div>
        <label className="label" htmlFor="justification">Justificativa (fica registrada para auditoria e para o Banco Central)</label>
        <textarea className="input min-h-28" id="justification" name="justification" required minLength={30} value={justification} onChange={(e) => setJustification(e.target.value)} />
      </div>
      {decision === "COMUNICADO" && (
        <div>
          <label className="label" htmlFor="protocol">Número do protocolo no SISCOAF</label>
          <input className="input" id="protocol" name="protocol" placeholder="Ex.: 2026.000123456" value={protocol} onChange={(e) => setProtocol(e.target.value)} />
          <p className="hint">
            Faça a comunicação no SISCOAF (siscoaf.coaf.gov.br) até o dia útil seguinte à decisão e registre o protocolo aqui. O cliente não pode ser informado (Lei 9.613/98, art. 11, II).
          </p>
        </div>
      )}
      {state.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      <SubmitButton pending="Registrando...">Registrar decisão</SubmitButton>
    </form>
  );
}
