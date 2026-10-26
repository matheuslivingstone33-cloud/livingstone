"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { confirmarPlano, enviarMensagem, type PlanoTela } from "@/app/actions-assistente";
import { Icon } from "./Icon";

type Msg = { role: "user" | "assistant"; texto: string; plano?: PlanoTela & { estado: "pendente" | "feito" | "cancelado" }; erro?: boolean };

const CHAVE = "finops:assistente";
const SUGESTOES = ["O que tenho para resolver hoje?", "Quais casos de PLD vencem esta semana?", "Como faço uma conciliação?", "Quanto já gastamos de IA hoje?"];

function ler(): Msg[] {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.texto === "string").slice(-40) : [];
  } catch {
    return [];
  }
}

/** Assistente da plataforma: aba lateral recolhível (tela cheia no celular). Histórico só nesta aba do navegador. */
export function Assistente({ podeConfirmar, comIa }: { podeConfirmar: boolean; comIa: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const titulo = useId();

  useEffect(() => setMsgs(ler()), []);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(CHAVE, JSON.stringify(msgs.slice(-40)));
    } catch {}
    fim.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  const fechar = useCallback(() => {
    setAberto(false);
    botao.current?.focus();
  }, []);

  useEffect(() => {
    if (!aberto) return;
    campo.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fechar();
        return;
      }
      if (e.key !== "Tab" || !painel.current) return;
      // Foco preso dentro do painel
      const f = [...painel.current.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled]), a[href]")];
      if (!f.length) return;
      const primeiro = f[0];
      const ultimo = f[f.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto, fechar]);

  async function enviar(pergunta: string) {
    const q = pergunta.trim();
    if (!q || pensando) return;
    const historico = msgs.filter((m) => !m.erro).map((m) => ({ role: m.role, texto: m.texto }));
    setMsgs((m) => [...m, { role: "user", texto: q }]);
    setTexto("");
    setPensando(true);
    try {
      const fd = new FormData();
      fd.set("mensagem", q);
      fd.set("historico", JSON.stringify(historico));
      const r = await enviarMensagem(fd);
      setMsgs((m) => [...m, r.ok ? { role: "assistant", texto: r.texto, plano: r.plano ? { ...r.plano, estado: "pendente" } : undefined } : { role: "assistant", texto: r.erro, erro: true }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", texto: "Não consegui falar com o servidor. Tente de novo.", erro: true }]);
    } finally {
      setPensando(false);
      campo.current?.focus();
    }
  }

  const marcar = (id: string, estado: "feito" | "cancelado") => setMsgs((m) => m.map((x) => (x.plano?.id === id ? { ...x, plano: { ...x.plano, estado } } : x)));

  async function confirmar(id: string) {
    if (pensando) return;
    setPensando(true);
    try {
      const r = await confirmarPlano(id);
      marcar(id, "feito");
      setMsgs((m) => [...m, r.ok ? { role: "assistant", texto: r.texto } : { role: "assistant", texto: r.erro, erro: true }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", texto: "Não consegui confirmar agora. Tente de novo.", erro: true }]);
    } finally {
      setPensando(false);
    }
  }

  function cancelar(id: string) {
    marcar(id, "cancelado");
    setMsgs((m) => [...m, { role: "assistant", texto: "Ação cancelada. Nada foi feito." }]);
  }

  const limpar = () => setMsgs([]);

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => (aberto ? fechar() : setAberto(true))}
        aria-expanded={aberto}
        aria-controls="assistente-painel"
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-3 text-sm font-semibold text-white shadow-lift transition-colors hover:bg-ink-950"
      >
        <Icon name="sparkle" size={16} className="text-gold-300" />
        Assistente
      </button>
      {aberto && (
        <div
          id="assistente-painel"
          ref={painel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titulo}
          className="fixed inset-0 z-50 flex flex-col bg-white md:inset-y-4 md:left-auto md:right-4 md:w-[400px] md:rounded-2xl md:border md:border-line md:shadow-lift"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 id={titulo} className="font-display text-base font-semibold text-ink-900">Assistente</h2>
              <p className="text-xs text-ink-500">{comIa ? "Explica a plataforma e consulta os dados da sua instituição." : "IA não configurada: respondo com o guia da plataforma."}</p>
            </div>
            <div className="flex items-center gap-1">
              {msgs.length > 0 && (
                <button type="button" onClick={limpar} className="btn-ghost text-xs">
                  Limpar
                </button>
              )}
              <button type="button" onClick={fechar} className="btn-ghost" aria-label="Fechar assistente">
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-ink-600">Pergunte como usar um módulo ou peça um número do dia. Ações só acontecem depois que você confirmar.</p>
                <ul className="space-y-2">
                  {SUGESTOES.map((s) => (
                    <li key={s}>
                      <button type="button" onClick={() => enviar(s)} className="w-full rounded-xl border border-line bg-paper/60 px-3 py-2 text-left text-ink-700 hover:border-ink-500/40 hover:text-ink-900">
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 leading-relaxed ${
                    m.role === "user" ? "bg-ink-900 text-white" : m.erro ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-paper text-ink-800 ring-1 ring-line"
                  }`}
                >
                  {m.texto}
                  {m.plano && (
                    <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-line">
                      <p className="eyebrow">Plano de ação</p>
                      <p className="mt-1 font-semibold text-ink-900">{m.plano.titulo}</p>
                      <p className="mt-1 text-ink-700">{m.plano.descricao}</p>
                      {m.plano.estado === "pendente" ? (
                        podeConfirmar ? (
                          <div className="mt-3 flex gap-2">
                            <button type="button" className="btn" disabled={pensando} onClick={() => confirmar(m.plano!.id)}>
                              Confirmar
                            </button>
                            <button type="button" className="btn-ghost" disabled={pensando} onClick={() => cancelar(m.plano!.id)}>
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-ink-500">Seu perfil só permite consultar.</p>
                        )
                      ) : (
                        <p className="mt-2 text-xs text-ink-500">{m.plano.estado === "feito" ? "Confirmado." : "Cancelado."}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {pensando && <p className="text-ink-500">Pensando…</p>}
            <div ref={fim} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-line px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
          >
            <label htmlFor="assistente-campo" className="sr-only">
              Sua pergunta
            </label>
            <textarea
              id="assistente-campo"
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar(texto);
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder="Escreva sua pergunta"
              className="min-h-10 flex-1 resize-none rounded-xl border border-line-strong px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
            />
            <button type="submit" className="btn" disabled={pensando || !texto.trim()}>
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  );
}
