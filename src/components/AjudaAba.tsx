"use client";

import { useEffect, useId, useState } from "react";
import { AJUDA, type Aba } from "@/lib/ajuda";
import { Icon } from "./Icon";

const chave = (aba: Aba) => `finops:ajuda:${aba}`;

/** Quadro "Para que serve" no topo de cada aba. Aberto por padrão; a escolha fica salva neste navegador. */
export function AjudaAba({ aba }: { aba: Aba }) {
  const a = AJUDA[aba];
  const [aberto, setAberto] = useState(true);
  const id = useId();

  useEffect(() => {
    try {
      if (window.localStorage.getItem(chave(aba)) === "fechado") setAberto(false);
    } catch {}
  }, [aba]);

  const alternar = () => {
    const novo = !aberto;
    setAberto(novo);
    try {
      window.localStorage.setItem(chave(aba), novo ? "aberto" : "fechado");
    } catch {}
  };

  return (
    <section aria-label={`Para que serve: ${a.titulo}`} className="mb-6 rounded-2xl border border-line bg-paper/60 px-4 py-3 text-sm md:px-5">
      <button type="button" onClick={alternar} aria-expanded={aberto} aria-controls={id} className="flex w-full items-center justify-between gap-3 text-left font-medium text-ink-900">
        <span className="flex items-center gap-2">
          <Icon name="info" size={16} className="shrink-0 text-brand-600" />
          Para que serve
        </span>
        <span className="text-xs font-normal text-ink-500">{aberto ? "Ocultar" : "Mostrar"}</span>
      </button>
      <div id={id} hidden={!aberto} className="mt-3 space-y-3 text-ink-700">
        {a.frases.map((f) => (
          <p key={f} className="leading-relaxed">{f}</p>
        ))}
        <ol className="grid gap-2 sm:grid-cols-3">
          {a.passos.map((p, i) => (
            <li key={p} className="flex gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-line">
              <span className="font-semibold tabular-nums text-brand-700" aria-hidden="true">{i + 1}.</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
        {a.exemplos?.length ? (
          <p className="text-xs text-ink-500">
            Quer testar? Baixe {a.exemplos.length > 1 ? "os arquivos" : "o arquivo"} de exemplo:{" "}
            {a.exemplos.map((e, i) => (
              <span key={e.href}>
                {i > 0 && " · "}
                <a className="link-action" href={e.href} download>{e.rotulo}</a>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </section>
  );
}
