"use client";

import { useActionState } from "react";
import { conferirRecibo, type ConferirState } from "@/app/actions-auditoria";

const MSG = {
  integro: ["notice-success", "Íntegro: o registro coberto pelo recibo continua igual no banco."],
  truncado: ["notice-danger", "Truncado: a trilha atual termina antes do registro coberto pelo recibo. Registros foram apagados."],
  divergente: ["notice-danger", "Divergente: o registro coberto pelo recibo foi alterado ou removido no banco."],
} as const;

export function ConferirRecibo() {
  const [state, action, pending] = useActionState<ConferirState, FormData>(conferirRecibo, {});
  const msg = state.resultado ? MSG[state.resultado] : null;
  return (
    <div className="space-y-4">
      {msg && (
        <div role="status" className={`notice ${msg[0]} mb-0`}>
          <div>
            <p className="font-medium">{msg[1]}</p>
            <p className="text-xs">Recibo seq {state.seq}, emitido em {state.emitidoEm}; último seq atual: {state.lastSeq}.</p>
          </div>
        </div>
      )}
      {state.error && <p className="notice notice-danger mb-0" role="alert">{state.error}</p>}
      <form action={action} className="space-y-3">
        <div>
          <label className="label" htmlFor="recibo-arquivo">Arquivo do recibo (.json)</label>
          <input className="input" id="recibo-arquivo" name="arquivo" type="file" accept="application/json,.json" />
        </div>
        <div>
          <label className="label" htmlFor="recibo-json">Ou cole o conteúdo</label>
          <textarea className="input font-mono text-xs" id="recibo-json" name="json" rows={4} maxLength={4096} />
        </div>
        <button className="btn" disabled={pending} aria-busy={pending || undefined}>{pending ? "Conferindo…" : "Conferir recibo"}</button>
      </form>
    </div>
  );
}
