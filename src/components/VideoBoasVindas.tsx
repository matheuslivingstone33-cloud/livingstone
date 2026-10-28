"use client";

import { useEffect, useState } from "react";

const CHAVE = "livingstone:video-boas-vindas:oculto";

// Cartão do vídeo "como usar a assistente". Quem esconder vê só um link discreto para rever.
export function VideoBoasVindas() {
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    try {
      setOculto(localStorage.getItem(CHAVE) === "1");
    } catch {}
  }, []);

  const mudar = (v: boolean) => {
    setOculto(v);
    try {
      if (v) localStorage.setItem(CHAVE, "1");
      else localStorage.removeItem(CHAVE);
    } catch {}
  };

  if (oculto) {
    return (
      <div className="mb-6 text-right">
        <button type="button" onClick={() => mudar(false)} className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
          Ver de novo o vídeo de como usar a assistente
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="video-boas-vindas" className="card rise mb-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="video-boas-vindas" className="text-lg font-semibold">
            Como pedir o que você precisa
          </h2>
          <p className="text-sm text-ink-500">Um vídeo curtinho mostrando como conversar com a assistente.</p>
        </div>
        <button type="button" onClick={() => mudar(true)} className="btn-ghost text-sm">
          Esconder
        </button>
      </div>
      <video
        className="block aspect-video w-full rounded-lg bg-ink-950"
        src="/video/amanda-como-usar.mp4"
        poster="/video/amanda-como-usar-poster.png"
        controls
        playsInline
        preload="metadata"
        aria-label="Vídeo: como pedir o que você precisa para a assistente"
      />
    </section>
  );
}
