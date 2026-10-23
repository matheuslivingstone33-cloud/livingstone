"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { revokeApiKey } from "@/app/actions-api";

function ConfirmSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-danger" disabled={pending}>
      {pending ? "Revogando..." : "Confirmar revogação"}
    </button>
  );
}

// Revogar corta o acesso na hora: pede confirmação explícita antes de enviar.
export function RevokeKeyButton({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const msgId = useId();

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [confirming]);

  const cancel = () => {
    returnFocus.current = true;
    setConfirming(false);
  };

  if (!confirming) {
    return (
      <button ref={triggerRef} type="button" className="btn-danger" onClick={() => setConfirming(true)}>
        Revogar
      </button>
    );
  }

  return (
    <form
      action={revokeApiKey}
      role="group"
      aria-labelledby={msgId}
      className="notice notice-danger mb-0 flex-col items-stretch gap-3 text-left sm:max-w-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <p id={msgId} className="whitespace-normal text-sm">
        Revogar a chave “{name}”? Sistemas que a usam param na hora.
      </p>
      <div className="flex flex-wrap gap-2">
        <ConfirmSubmit />
        <button ref={cancelRef} type="button" className="btn-ghost" onClick={cancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
