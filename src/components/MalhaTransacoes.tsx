"use client";

import { useEffect, useRef } from "react";
import { criarSorteio, intensidade, pontosDaGrade, proximoPulso, type Pulso } from "@/lib/malha";

// Fundo do hero: alguns cruzamentos da grade acendem como pagamentos chegando.
// Pausa fora da tela e com a aba oculta; com reduced-motion ou no celular, fica parado.
const DUR = 2400;
const INTERVALO = 850;
const MAX = 9;

export function MalhaTransacoes({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const css = getComputedStyle(document.documentElement);
    const cores = {
      brand: css.getPropertyValue("--color-brand-400").trim() || "#34b59a",
      ouro: css.getPropertyValue("--color-gold-400").trim() || "#e0b84a",
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pequeno = window.matchMedia("(max-width: 639px)");

    let w = 0;
    let h = 0;
    let dpr = 1;
    let pontos = pontosDaGrade(0, 0);
    let ativos: (Pulso & { inicio: number })[] = [];
    let raf = 0;
    let ultimo = 0;
    let visivel = true;
    const rng = criarSorteio(44);

    const ponto = (p: Pulso, a: number) => {
      const x = Math.round(p.x * dpr) / dpr;
      const y = Math.round(p.y * dpr) / dpr;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
      g.addColorStop(0, cores[p.cor]);
      g.addColorStop(1, "transparent");
      ctx.globalAlpha = a * 0.45;
      ctx.fillStyle = g;
      ctx.fillRect(x - 12, y - 12, 24, 24);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = cores[p.cor];
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const estatico = () => {
      ctx.clearRect(0, 0, w, h);
      const r = criarSorteio(7);
      for (let i = 0; i < 6; i++) {
        const p = proximoPulso(r, pontos);
        if (p) ponto(p, 0.7);
      }
    };

    const quadro = (t: number) => {
      raf = 0;
      if (!visivel || document.hidden) return;
      if (t - ultimo > INTERVALO && ativos.length < MAX) {
        const p = proximoPulso(rng, pontos);
        if (p) ativos.push({ ...p, inicio: t });
        ultimo = t;
      }
      ctx.clearRect(0, 0, w, h);
      ativos = ativos.filter((p) => t - p.inicio < DUR);
      for (const p of ativos) ponto(p, intensidade(t - p.inicio, DUR));
      raf = requestAnimationFrame(quadro);
    };

    const parado = () => reduce.matches || pequeno.matches;
    const iniciar = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (w === 0 || h === 0) return;
      if (parado()) estatico();
      else raf = requestAnimationFrame(quadro);
    };

    const medir = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pontos = pontosDaGrade(w, h);
      iniciar();
    };

    const ro = new ResizeObserver(medir);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
      if (visivel) iniciar();
    });
    io.observe(canvas);
    const aba = () => {
      if (!document.hidden) iniciar();
    };
    document.addEventListener("visibilitychange", aba);
    reduce.addEventListener("change", iniciar);
    pequeno.addEventListener("change", iniciar);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", aba);
      reduce.removeEventListener("change", iniciar);
      pequeno.removeEventListener("change", iniciar);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
