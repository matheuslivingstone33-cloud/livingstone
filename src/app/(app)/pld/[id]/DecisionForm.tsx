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
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Decisão do analista</h2>
      {pepNeedsAdmin && (
        <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">Cliente PEP: somente um Administrador pode registrar a decisão.</p>
      )}
      <div className="flex flex-wrap gap-3">
        <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${mandatory ? "opacity-50" : "cursor-pointer"}`}>
          <input type="radio" name="decision" value="ARQUIVADO" disabled={mandatory} checked={decision === "ARQUIVADO"} onChange={() => setDecision("ARQUIVADO")} />
          Arquivar (sem indícios após análise)
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <input type="radio" name="decision" value="COMUNICADO" checked={decision === "COMUNICADO"} onChange={() => setDecision("COMUNICADO")} />
          Comunicar ao COAF
        </label>
      </div>
      <div>
        <label className="label" htmlFor="justification">Justificativa (fica registrada para auditoria e para o Banco Central)</label>
        <textarea className="input min-h-28" id="justification" name="justification" required minLength={30} value={justification} onChange={(e) => setJustification(e.target.value)} />
      </div>
      {decision === "COMUNICADO" && (
        <div>
          <label className="label" htmlFor="protocol">Número do protocolo no SISCOAF</label>
          <input className="input" id="protocol" name="protocol" placeholder="Ex.: 2026.000123456" value={protocol} onChange={(e) => setProtocol(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">
            Faça a comunicação no SISCOAF (siscoaf.coaf.gov.br) até o dia útil seguinte à decisão e registre o protocolo aqui. O cliente não pode ser informado (Lei 9.613/98, art. 11, II).
          </p>
        </div>
      )}
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <SubmitButton pending="Registrando...">Registrar decisão</SubmitButton>
    </form>
  );
}
