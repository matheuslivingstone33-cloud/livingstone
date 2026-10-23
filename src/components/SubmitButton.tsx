"use client";

import { useFormStatus } from "react-dom";

/** Aviso exibido enquanto uma ação com IA está em andamento. */
export const AI_PENDING = "Gerando…, leva alguns segundos";

export function SubmitButton({
  children,
  pending,
  variant = "btn",
  hint,
}: {
  children: React.ReactNode;
  pending: string;
  variant?: "btn" | "link";
  hint?: string;
}) {
  const { pending: isPending } = useFormStatus();
  const cls = variant === "link" ? "link-action whitespace-nowrap inline-flex items-center gap-1.5" : "btn";
  return (
    <>
      <button className={cls} disabled={isPending} aria-busy={isPending || undefined}>
        {isPending && (
          <svg width={variant === "link" ? 14 : 16} height={variant === "link" ? 14 : 16} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="motion-safe:animate-spin">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
        {isPending ? pending : children}
      </button>
      {hint && (
        <span role="status" aria-live="polite" className={isPending ? "hint mt-1 block text-xs" : "sr-only"}>
          {isPending ? hint : ""}
        </span>
      )}
    </>
  );
}
