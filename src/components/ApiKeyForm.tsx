"use client";

import { useActionState } from "react";
import { createApiKey, type CreateKeyState } from "@/app/actions-api";
import { CopyButton } from "@/components/CopyButton";

const SCOPES = [
  ["conciliacao:write", "Criar conciliações"],
  ["conciliacao:read", "Consultar conciliações"],
] as const;

export function ApiKeyForm() {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createApiKey, {});
  return (
    <div className="space-y-4">
      {state.secret && (
        <div className="notice notice-warning mb-0 space-y-3" role="status">
          <p className="font-medium">Chave “{state.name}” criada. Copie agora: ela não será mostrada de novo.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-xl border border-line bg-white px-3 py-2 font-mono text-xs text-ink-700">{state.secret}</code>
            <CopyButton text={state.secret} label="Copiar chave" />
          </div>
          <p className="text-xs">Guarde em um cofre de segredos do sistema que vai chamar a API. Se perder, revogue e crie outra.</p>
        </div>
      )}
      {state.error && <p className="notice notice-danger mb-0" role="alert">{state.error}</p>}
      <form action={action} className="flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="api-key-name">Nome da chave</label>
          <input className="input" id="api-key-name" name="name" maxLength={80} placeholder="ERP financeiro" required />
        </div>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="label">Escopos</legend>
          {SCOPES.map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" name="scopes" value={v} defaultChecked />
              <span>{l} <code className="font-mono text-xs text-ink-500">{v}</code></span>
            </label>
          ))}
        </fieldset>
        <button type="submit" className="btn" disabled={pending}>{pending ? "Criando..." : "Criar chave"}</button>
      </form>
    </div>
  );
}
