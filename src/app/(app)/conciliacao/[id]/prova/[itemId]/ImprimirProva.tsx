"use client";

import { useTransition } from "react";
import { registrarProvaImpressa } from "../../../../../actions-conciliacao";

/** Registra na auditoria e abre a impressão do navegador (onde dá para salvar em PDF). */
export function ImprimirProva({ recId, itemId }: { recId: string; itemId: string }) {
  const [pendente, start] = useTransition();
  return (
    <button
      type="button"
      className="btn"
      disabled={pendente}
      onClick={() =>
        start(async () => {
          await registrarProvaImpressa(recId, itemId).catch(() => undefined);
          window.print();
        })
      }
    >
      Imprimir / salvar PDF
    </button>
  );
}
