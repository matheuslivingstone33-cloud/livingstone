"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pending }: { children: React.ReactNode; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button className="btn" disabled={isPending} aria-busy={isPending || undefined}>
      {isPending && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="motion-safe:animate-spin">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )}
      {isPending ? pending : children}
    </button>
  );
}
