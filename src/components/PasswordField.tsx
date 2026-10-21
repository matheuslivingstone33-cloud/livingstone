"use client";

import { useId, useState } from "react";
import { passwordProblem, passwordRules } from "@/lib/password";

// Campo de senha nova com a regra visível: cada item fica verde quando atendido e o
// formulário não envia enquanto a senha não passar (o servidor valida de novo).
export function PasswordField({ id, name, placeholder, label }: { id?: string; name: string; placeholder?: string; label?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-regras`;
  const [value, setValue] = useState("");
  const rules = passwordRules(value);

  return (
    <div className="min-w-0">
      {label && (
        <label className="label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        className="input"
        id={inputId}
        name={name}
        type="password"
        placeholder={placeholder}
        required
        minLength={12}
        autoComplete="new-password"
        aria-label={label ? undefined : "Senha"}
        aria-describedby={hintId}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          e.target.setCustomValidity(passwordProblem(e.target.value) ?? "");
        }}
        onInvalid={(e) => e.currentTarget.setCustomValidity(passwordProblem(e.currentTarget.value) ?? "")}
      />
      <ul id={hintId} className="mt-2 space-y-1 text-xs" aria-live="polite">
        {rules.map((r) => (
          <li key={r.id} className={`flex items-center gap-1.5 ${value && r.ok ? "text-brand-700" : value ? "text-red-700" : "text-ink-500"}`}>
            <span aria-hidden="true">{value && r.ok ? "✓" : value ? "✕" : "•"}</span>
            <span>
              {r.label}
              <span className="sr-only">{value ? (r.ok ? ": atendido" : ": não atendido") : ""}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
