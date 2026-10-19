"use client";

import { useEffect, useRef, useState } from "react";

// Toca sozinho em loop, exceto para quem pediu "reduzir movimento" no sistema:
// nesse caso mostra o poster e só toca se a pessoa clicar.
export function HeroVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      const v = ref.current;
      if (!v) return;
      if (mq.matches) {
        v.pause();
      } else {
        v.play().catch(() => {});
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div className="relative">
      <video
        ref={ref}
        className="block aspect-video w-full"
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        controls={reduced && playing}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        aria-label={label}
      />
      {reduced && !playing && (
        <button
          type="button"
          onClick={() => ref.current?.play().catch(() => {})}
          className="absolute inset-0 m-auto flex h-20 w-20 items-center justify-center rounded-full bg-ink-950/80 text-gold-300 ring-1 ring-white/15 transition hover:bg-ink-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-400"
          aria-label="Reproduzir animação"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" />
          </svg>
        </button>
      )}
    </div>
  );
}
