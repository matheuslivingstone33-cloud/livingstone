"use client";

import { useActionState, useState } from "react";
import { aceitarDivergencia, baixarItem, reabrirItem, vincularItens, type ResolverState } from "../../../actions-conciliacao-manual";
import { SubmitButton } from "@/components/SubmitButton";

type Opcao = { id: string; label: string };
type Acao = "vincular" | "aceitar" | "baixar" | "reabrir";
const MIN = 20;

const ACOES = { vincular: vincularItens, aceitar: aceitarDivergencia, baixar: baixarItem, reabrir: reabrirItem };
const ROTULO: Record<Acao, string> = { vincular: "Vincular", aceitar: "Aceitar divergência", baixar: "Baixar", reabrir: "Reabrir" };

function Formulario({ acao, itemId, opcoes, onCancel }: { acao: Acao; itemId: string; opcoes: Opcao[]; onCancel: () => void }) {
  const [state, action] = useActionState<ResolverState, FormData>(ACOES[acao], {});
  const [txt, setTxt] = useState("");
  const n = txt.trim().length;
  if (state.ok) return <p role="status" className="text-xs text-emerald-700">{state.ok}</p>;
  return (
    <form action={action} className="mt-2 grid min-w-64 gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      {acao === "vincular" && (
        <select className="input" name="outroId" required aria-label="Crédito não esperado a vincular" defaultValue="">
          <option value="" disabled>Escolha o crédito não esperado</option>
          {opcoes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
      <textarea
        className="input min-h-20" name="justification" required minLength={MIN} aria-label="Justificativa"
        placeholder="Justificativa (fica registrada para auditoria)" value={txt} onChange={(e) => setTxt(e.target.value)}
      />
      <span className={`text-xs ${n < MIN ? "text-ink-500" : "text-emerald-700"}`}>{n}/{MIN} caracteres mínimos</span>
      {state.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{state.error}</p>}
      <div className="flex gap-2">
        <SubmitButton pending="Gravando...">{ROTULO[acao]}</SubmitButton>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export function ResolverItem({ itemId, status, resolvido, isAdmin, opcoes }: { itemId: string; status: string; resolvido: boolean; isAdmin: boolean; opcoes: Opcao[] }) {
  const [aberta, setAberta] = useState<Acao | null>(null);
  const disponiveis: Acao[] = resolvido
    ? isAdmin ? ["reabrir"] : []
    : [
        ...(status === "PENDENTE" && opcoes.length ? (["vincular"] as Acao[]) : []),
        ...(status === "DIVERGENTE" ? (["aceitar"] as Acao[]) : []),
        ...(["PENDENTE", "NAO_ESPERADO", "DIVERGENTE"].includes(status) ? (["baixar"] as Acao[]) : []),
      ];
  if (!disponiveis.length) return null;
  if (aberta) return <Formulario key={aberta} acao={aberta} itemId={itemId} opcoes={opcoes} onCancel={() => setAberta(null)} />;
  return (
    <div className="flex flex-wrap gap-1">
      {disponiveis.map((a) => (
        <button key={a} type="button" className="chip" onClick={() => setAberta(a)}>{ROTULO[a]}</button>
      ))}
    </div>
  );
}
