"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";

// Nunca mostra error.message (pode carregar detalhe interno); só o código de rastreio.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <section className="card mx-auto mt-6 max-w-xl text-center" role="alert">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-paper-2 text-ink-700" aria-hidden="true">
        <Icon name="alert" size={22} />
      </span>
      <h1 ref={ref} tabIndex={-1} className="font-display text-2xl font-semibold tracking-tight text-ink-900 focus:outline-none">
        Algo deu errado
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">
        Não foi possível carregar esta página. Tente de novo; se persistir, fale com o administrador.
      </p>
      {error.digest && (
        <p className="mt-3 text-xs text-ink-500">
          Código para o suporte: <code className="font-mono">{error.digest}</code>
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn" onClick={() => reset()}>Tentar de novo</button>
        <Link href="/dashboard" className="btn-ghost">Ir para o painel</Link>
      </div>
    </section>
  );
}
