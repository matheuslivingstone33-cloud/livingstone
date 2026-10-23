"use client";

import { useEffect, useRef, useState } from "react";

// Toca sozinho, mudo e em loop, exceto para quem pediu "reduzir movimento" no sistema (fica no poster).
// O botão de pausar/reproduzir está sempre visível; a pausa da pessoa é respeitada e o vídeo
// também para quando sai da tela, só voltando se não houver pausa manual nem redução de movimento.
export function HeroVideo({
  src,
  poster,
  label,
  labels,
}: {
  src: string;
  poster: string;
  label: string;
  labels: { play: string; pause: string };
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const reducedRef = useRef(false);
  const userPausedRef = useRef(false);
  const visibleRef = useRef(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const sync = () => {
      if (!reducedRef.current && !userPausedRef.current && visibleRef.current) v.play().catch(() => {});
      else v.pause();
    };

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      reducedRef.current = mq.matches;
      sync();
    };
    onMotion();
    mq.addEventListener("change", onMotion);

    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        sync();
      },
      { threshold: 0.25 },
    );
    io.observe(v);

    return () => {
      mq.removeEventListener("change", onMotion);
      io.disconnect();
    };
  }, []);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      // Clique explícito toca mesmo com redução de movimento; ao sair da tela, não retoma sozinho.
      userPausedRef.current = false;
      v.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      v.pause();
    }
  };

  const action = playing ? labels.pause : labels.play;

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
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        aria-label={label}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={action}
        className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-ink-950/80 py-2 pl-3 pr-4 text-xs font-medium text-white ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 sm:bottom-4 sm:right-4"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-gold-300" aria-hidden="true">
          {playing ? (
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          ) : (
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" />
          )}
        </svg>
        <span aria-hidden="true">{action}</span>
      </button>
    </div>
  );
}
