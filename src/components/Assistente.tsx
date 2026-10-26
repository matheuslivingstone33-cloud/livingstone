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
        aria-label="Assistente"
        className="on-ink fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2.5 rounded-full bg-ink-900 px-1.5 text-sm font-semibold text-white shadow-lift ring-1 ring-white/10 transition-[background-color,transform] hover:bg-ink-950 motion-safe:hover:-translate-y-0.5 md:pr-5"
      >
        <Marca />
        <span className="hidden md:inline">Assistente</span>
      </button>
      {aberto && (
        <div
          id="assistente-painel"
          ref={painel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titulo}
          className="assist-in fixed inset-0 z-50 flex flex-col overflow-hidden bg-white md:inset-y-4 md:left-auto md:right-4 md:w-[420px] md:rounded-2xl md:border md:border-line md:shadow-lift"
        >
          <div className="on-ink relative flex items-start justify-between gap-3 bg-ink-900 px-5 py-4 text-white">
            <div className="flex min-w-0 items-start gap-3">
              <Marca />
              <div className="min-w-0">
                <h2 id={titulo} className="font-display text-[17px] font-semibold leading-tight tracking-tight">
                  Assistente Livingstone
                </h2>
                <p className="mt-0.5 text-xs leading-snug text-white/75">Explica, consulta e prepara ações — você confirma</p>
                {!comIa && <p className="mt-1.5 text-[11px] leading-snug text-gold-300">IA não configurada: respondo com o guia da plataforma.</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {msgs.length > 0 && (
                <button type="button" onClick={limpar} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white">
                  Limpar
                </button>
              )}
              <button type="button" onClick={fechar} className="grid size-8 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white" aria-label="Fechar assistente">
                <Icon name="close" size={16} />
              </button>
            </div>
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-gold-400/0 via-gold-400/60 to-gold-400/0" />
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-paper/60 px-5 py-5 text-sm" aria-live="polite">
            {msgs.length === 0 && (
              <div className="space-y-5 pt-1">
                <div>
                  <span className="rule-gold" />
                  <p className="mt-3 font-display text-lg font-semibold leading-snug text-ink-900">Como posso ajudar a operação hoje?</p>
                  <p className="mt-1.5 leading-relaxed text-ink-600">Pergunte como usar um módulo ou peça um número do dia. Ações só acontecem depois que você confirmar.</p>
                </div>
                <div>
                  <p className="eyebrow">Sugestões</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {SUGESTOES.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => enviar(s)}
                          className="rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-left text-[13px] text-ink-700 transition-colors hover:border-brand-600/50 hover:bg-brand-50 hover:text-ink-900"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-ink-900 px-3.5 py-2.5 leading-relaxed text-white">{m.texto}</div>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-2.5">
                  <span aria-hidden className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${m.erro ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-ink-900 text-gold-300"}`}>
                    <Icon name={m.erro ? "alert" : "sparkle"} size={13} />
                  </span>
                  <div className="min-w-0 max-w-[88%] flex-1">
                    <div
                      className={`whitespace-pre-line rounded-2xl rounded-tl-md px-3.5 py-2.5 leading-relaxed ${
                        m.erro ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-white text-ink-800 shadow-[0_1px_2px_rgba(10,31,44,0.06)] ring-1 ring-line"
                      }`}
                    >
                      {m.texto}
                    </div>
                    {m.plano && (
                      <div className={`mt-2 overflow-hidden rounded-xl bg-white ring-1 ${m.plano.estado === "pendente" ? "shadow-[0_4px_14px_-6px_rgba(10,31,44,0.18)] ring-gold-400/70" : "ring-line"}`}>
                        <div className={`flex items-center gap-2 border-b px-3.5 py-2 ${m.plano.estado === "pendente" ? "border-gold-100 bg-gold-50" : "border-line bg-paper"}`}>
                          <Icon name="check" size={14} className={m.plano.estado === "pendente" ? "text-gold-700" : "text-ink-500"} />
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-700">Plano de ação</p>
                        </div>
                        <div className="px-3.5 py-3">
                          <p className="font-semibold text-ink-900">{m.plano.titulo}</p>
                          <p className="mt-1 leading-relaxed text-ink-700">{m.plano.descricao}</p>
                          {m.plano.estado === "pendente" ? (
                            podeConfirmar ? (
                              <>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button type="button" className="btn" disabled={pensando} onClick={() => confirmar(m.plano!.id)}>
                                    <Icon name="check" size={14} />
                                    Confirmar
                                  </button>
                                  <button type="button" className="btn-ghost" disabled={pensando} onClick={() => cancelar(m.plano!.id)}>
                                    Cancelar
                                  </button>
                                </div>
                                <p className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-500">
                                  <Icon name="clock" size={12} />
                                  Vale por 10 minutos. Depois disso, peça de novo.
                                </p>
                              </>
                            ) : (
                              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-500">
                                <Icon name="lock" size={12} />
                                Seu perfil só permite consultar.
                              </p>
                            )
                          ) : (
                            <p
                              className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                                m.plano.estado === "feito" ? "bg-brand-50 text-brand-800" : "bg-paper-2 text-ink-600"
                              }`}
                            >
                              {m.plano.estado === "feito" && <Icon name="check" size={12} />}
                              {m.plano.estado === "feito" ? "Confirmado." : "Cancelado."}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {pensando && (
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-900 text-gold-300">
                  <Icon name="sparkle" size={13} />
                </span>
                <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-ink-500 ring-1 ring-line">
                  <span aria-hidden className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="assist-dot size-1.5 rounded-full bg-brand-600" style={{ animationDelay: `${d * 0.15}s` }} />
                    ))}
                  </span>
                  <span className="text-xs">Pensando…</span>
                </div>
              </div>
            )}
            <div ref={fim} />
          </div>

          <div className="border-t border-line bg-white px-4 py-3">
            <form
              className="flex items-end gap-2 rounded-2xl border border-line-strong bg-white p-1.5 pl-3 transition-colors focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-100"
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
                aria-describedby="assistente-dica"
                className="min-h-10 flex-1 resize-none bg-transparent py-1.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:outline-none"
              />
              <button
                type="submit"
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-500/40"
                disabled={pensando || !texto.trim()}
                aria-label="Enviar pergunta"
              >
                <EnviarIcone />
              </button>
            </form>
            <p id="assistente-dica" className="mt-2 px-1 text-[11px] leading-snug text-ink-500">
              <span className="hidden md:inline">Enter envia, Shift+Enter quebra linha. </span>
              Respostas podem conter erros. Ações só com sua confirmação.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/** Selo do assistente: brilho dourado sobre tinta, no mesmo vocabulário da marca. */
function Marca() {
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-700 to-ink-950 ring-1 ring-gold-400/40">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8L12 3z" fill="var(--color-gold-300)" />
        <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" fill="var(--color-gold-400)" opacity="0.8" />
      </svg>
    </span>
  );
}

function EnviarIcone() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
