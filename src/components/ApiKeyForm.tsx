"use client";

import { useActionState, useEffect, useRef } from "react";
import { createApiKey, type CreateKeyState } from "@/app/actions-api";
import { CopyButton } from "@/components/CopyButton";

const SCOPES = [
  ["conciliacao:write", "Criar conciliações"],
  ["conciliacao:read", "Consultar conciliações"],
] as const;

export function ApiKeyForm() {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createApiKey, {});
  const headRef = useRef<HTMLHeadingElement>(null);
  // Leva o foco ao aviso quando uma chave nova aparece: o segredo só é mostrado esta vez
  useEffect(() => {
    if (state.secret) headRef.current?.focus();
  }, [state.secret]);
  return (
    <div className="space-y-4">
      {state.secret && (
        <div className="notice notice-warning mb-0 flex-col items-stretch gap-3">
          <h3 ref={headRef} tabIndex={-1} className="font-display text-base font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
            Chave criada — copie agora
          </h3>
          <p id="api-secret-hint">A chave “{state.name}” não será mostrada de novo. Guarde em um cofre de segredos do sistema que vai chamar a API; se perder, revogue e crie outra.</p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="api-secret" className="sr-only">Chave secreta</label>
            <input
              id="api-secret"
              readOnly
              value={state.secret}
              aria-describedby="api-secret-hint"
              onFocus={(e) => e.currentTarget.select()}
              className="input min-w-0 flex-1 font-mono text-xs"
              spellCheck={false}
              autoComplete="off"
            />
            <CopyButton text={state.secret} label="Copiar chave" />
          </div>
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
