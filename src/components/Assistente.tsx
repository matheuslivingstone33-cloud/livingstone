"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { confirmarDocumento, confirmarPlano, enviarMensagem, type DocumentoTela, type EntendimentoTela, type PlanoTela } from "@/app/actions-assistente";
import { ajustarEntendimento, confirmarEntendimento } from "@/app/actions-pedidos";
import { blocosDoTexto, protocoloDe } from "@/lib/assistente-formato";
import { fmtDataHora } from "@/lib/tz";
import { MAX_UPLOAD_BYTES, formatBytes, uploadSizeError } from "@/lib/upload-limits";
import { Icon } from "./Icon";

type Comprovante = { protocolo: string; quando: string; por: string };
type EstadoEntendimento = "pendente" | "confirmado" | "ajustando";
type EstadoDocumento = "pendente" | "salvo" | "ajustando";
const ACEITOS = ".csv,.xlsx,.pdf,.png,.jpg,.jpeg,.webp";
const AVISO_ANEXO = "PDF e imagem são lidos inteiros pela IA; evite documentos com dados pessoais desnecessários.";
const ROTULO_FORMATO: Record<string, string> = { PLANILHA: "Planilha", PDF: "PDF", IMAGEM: "Imagem" };
type Msg = {
  role: "user" | "assistant";
  texto: string;
  plano?: PlanoTela & { estado: "pendente" | "feito" | "cancelado"; comprovante?: Comprovante };
  entendimento?: EntendimentoTela & { estado: EstadoEntendimento };
  documento?: DocumentoTela & { estado: EstadoDocumento };
  anexo?: string;
  erro?: boolean;
};

const CHAVE = "finops:assistente";
// Atalhos: cada um vira uma pergunta que as ferramentas de consulta respondem (painel, conciliação, PLD).
const ATALHOS = [
  { rotulo: "Resumo do dia", icone: "painel", pergunta: "Quais são os números do painel hoje?" },
  { rotulo: "Cobrar", icone: "cobranca", pergunta: "Quanto há de dívida em aberto e quais acordos estão vencendo?" },
  { rotulo: "Conciliar", icone: "conciliacao", pergunta: "Qual o resultado da última conciliação e quais pendências ficaram?" },
  { rotulo: "PLD", icone: "pld", pergunta: "Quais casos de PLD vencem nos próximos 7 dias?" },
] as const;

function ler(): Msg[] {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.texto === "string").slice(-40) : [];
  } catch {
    return [];
  }
}

/** Assistente da plataforma: aba lateral recolhível (tela cheia no celular). Histórico só nesta aba do navegador. */
export function Assistente({
  podeConfirmar,
  comIa,
  nome,
  perfil,
  instituicao,
}: {
  podeConfirmar: boolean;
  comIa: boolean;
  nome: string;
  perfil: string;
  instituicao: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [atalhos, setAtalhos] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  // Pedido em andamento (modo pedido/descoberta): vai no FormData até haver consenso
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  // Anexo escolhido (vai só no próximo envio) e rascunho de documento em ajuste (vai por id, sem reenviar o arquivo)
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState("");
  const [documentoId, setDocumentoId] = useState<string | null>(null);
  const seletor = useRef<HTMLInputElement>(null);
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

  function escolherArquivo(f: File | null) {
    setErroArquivo("");
    if (seletor.current) seletor.current.value = "";
    if (!f) return setArquivo(null);
    if (f.size > MAX_UPLOAD_BYTES) {
      setArquivo(null);
      setErroArquivo(uploadSizeError(f.name, f.size));
      return;
    }
    setArquivo(f);
  }

  async function enviar(pergunta: string) {
    const anexo = podeConfirmar ? arquivo : null;
    const q = pergunta.trim() || (anexo ? "O que é este documento?" : "");
    if (!q || pensando) return;
    setAtalhos(false);
    const historico = msgs.filter((m) => !m.erro).map((m) => ({ role: m.role, texto: m.texto }));
    setMsgs((m) => [...m, { role: "user", texto: q, anexo: anexo ? `${anexo.name} · ${formatBytes(anexo.size)}` : undefined }]);
    setTexto("");
    setArquivo(null);
    setErroArquivo("");
    setPensando(true);
    try {
      const fd = new FormData();
      fd.set("mensagem", q);
      fd.set("historico", JSON.stringify(historico));
      if (pedidoId) fd.set("pedidoId", pedidoId);
      if (anexo) fd.set("arquivo", anexo);
      else if (documentoId) fd.set("documentoId", documentoId);
      const r = await enviarMensagem(fd);
      if (r.ok && r.documento) {
        const id = r.documento.id;
        setDocumentoId(null);
        setMsgs((m) => m.map((x) => (x.documento?.id === id && x.documento.estado === "pendente" ? { ...x, documento: { ...x.documento, estado: "ajustando" } } : x)));
      }
      if (r.ok && r.entendimento) {
        const id = r.entendimento.pedidoId;
        setPedidoId(id);
        // Versão nova substitui o cartão pendente anterior do mesmo pedido
        setMsgs((m) => m.map((x) => (x.entendimento?.pedidoId === id && x.entendimento.estado === "pendente" ? { ...x, entendimento: { ...x.entendimento, estado: "ajustando" } } : x)));
      }
      setMsgs((m) => [
        ...m,
        r.ok
          ? { role: "assistant", texto: r.texto, plano: r.plano ? { ...r.plano, estado: "pendente" } : undefined, entendimento: r.entendimento ? { ...r.entendimento, estado: "pendente" } : undefined, documento: r.documento ? { ...r.documento, estado: "pendente" } : undefined }
          : { role: "assistant", texto: r.erro, erro: true },
      ]);
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
      if (r.ok) {
        const c: Comprovante = { protocolo: protocoloDe(id), quando: fmtDataHora(r.executadoEm ?? new Date()), por: `${nome} · ${perfil}` };
        setMsgs((m) => m.map((x) => (x.plano?.id === id ? { ...x, plano: { ...x.plano, comprovante: c } } : x)));
      }
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

  const marcarEnt = (id: string, versao: number, estado: EstadoEntendimento) =>
    setMsgs((m) => m.map((x) => (x.entendimento?.pedidoId === id && x.entendimento.versao === versao ? { ...x, entendimento: { ...x.entendimento, estado } } : x)));

  async function confirmarEnt(e: EntendimentoTela) {
    if (pensando) return;
    setPensando(true);
    try {
      const r = await confirmarEntendimento(e.pedidoId, e.versao);
      if (r.ok) {
        marcarEnt(e.pedidoId, e.versao, "confirmado");
        setPedidoId(null);
      }
      setMsgs((m) => [...m, r.ok ? { role: "assistant", texto: r.texto } : { role: "assistant", texto: r.erro, erro: true }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", texto: "Não consegui registrar agora. Tente de novo.", erro: true }]);
    } finally {
      setPensando(false);
    }
  }

  async function ajustarEnt(e: EntendimentoTela) {
    if (pensando) return;
    setPensando(true);
    try {
      const r = await ajustarEntendimento(e.pedidoId);
      if (r.ok) {
        marcarEnt(e.pedidoId, e.versao, "ajustando");
        setPedidoId(e.pedidoId);
      }
      setMsgs((m) => [...m, r.ok ? { role: "assistant", texto: r.texto } : { role: "assistant", texto: r.erro, erro: true }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", texto: "Não consegui abrir o ajuste agora. Tente de novo.", erro: true }]);
    } finally {
      setPensando(false);
      campo.current?.focus();
    }
  }

  const marcarDoc = (id: string, estado: EstadoDocumento) =>
    setMsgs((m) => m.map((x) => (x.documento?.id === id && x.documento.estado !== "salvo" ? { ...x, documento: { ...x.documento, estado } } : x)));

  async function confirmarDoc(d: DocumentoTela) {
    if (pensando) return;
    setPensando(true);
    try {
      const r = await confirmarDocumento(d.id);
      if (r.ok) {
        marcarDoc(d.id, "salvo");
        setDocumentoId(null);
      }
      setMsgs((m) => [...m, r.ok ? { role: "assistant", texto: r.texto } : { role: "assistant", texto: r.erro, erro: true }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", texto: "Não consegui salvar agora. Tente de novo.", erro: true }]);
    } finally {
      setPensando(false);
    }
  }

  function ajustarDoc(d: DocumentoTela) {
    marcarDoc(d.id, "ajustando");
    setDocumentoId(d.id);
    setMsgs((m) => [...m, { role: "assistant", texto: "Diga o que ajustar no entendimento do documento. Não precisa anexar de novo." }]);
    campo.current?.focus();
  }

  const limpar = () => {
    setMsgs([]);
    setPedidoId(null);
    setDocumentoId(null);
    setArquivo(null);
    setErroArquivo("");
  };

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
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug text-white/80">
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-400/15 px-2 py-0.5 font-medium text-brand-100 ring-1 ring-brand-400/30">
                    <Icon name="lock" size={11} />
                    Ambiente seguro
                  </span>
                  {instituicao && <span className="max-w-[12rem] truncate">{instituicao}</span>}
                  {instituicao && <span aria-hidden className="text-white/40">·</span>}
                  <span>{perfil}</span>
                </p>
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

          <p className="flex items-center gap-1.5 border-b border-line bg-paper px-5 py-1.5 text-[11px] leading-snug text-ink-600">
            <Icon name="lock" size={11} />
            Esta conversa é registrada. CPF e CNPJ são mascarados.
          </p>

          <div className="flex-1 space-y-4 overflow-y-auto bg-paper/60 px-5 py-5 text-sm" aria-live="polite">
            {msgs.length === 0 && (
              <div className="space-y-5 pt-1">
                <div>
                  <span className="rule-gold" />
                  <p className="mt-3 font-display text-lg font-semibold leading-snug text-ink-900">Como posso ajudar a operação hoje?</p>
                  <p className="mt-1.5 leading-relaxed text-ink-600">Pergunte como usar um módulo ou peça um número do dia. Ações só acontecem depois que você confirmar.</p>
                </div>
                <div>
                  <p className="eyebrow">Atalhos</p>
                  <Atalhos onEscolher={enviar} desabilitado={pensando} />
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-ink-900 px-3.5 py-2.5 leading-relaxed text-white">
                    {m.anexo && (
                      <span className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 text-xs text-white/85">
                        <Icon name="file" size={12} />
                        <span className="min-w-0 truncate">{m.anexo}</span>
                      </span>
                    )}
                    {m.texto}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-2.5">
                  <span aria-hidden className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${m.erro ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-ink-900 text-gold-300"}`}>
                    <Icon name={m.erro ? "alert" : "sparkle"} size={13} />
                  </span>
                  <div className="min-w-0 max-w-[88%] flex-1">
                    <div
                      className={`rounded-2xl rounded-tl-md px-3.5 py-2.5 leading-relaxed tabular-nums ${
                        m.erro ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-white text-ink-800 shadow-[0_1px_2px_rgba(10,31,44,0.06)] ring-1 ring-line"
                      }`}
                    >
                      {m.erro ? <p className="whitespace-pre-line">{m.texto}</p> : <TextoAssistente texto={m.texto} />}
                    </div>
                    {m.entendimento && (
                      <EntendimentoCartao e={m.entendimento} podeConfirmar={podeConfirmar} pensando={pensando} onConfirmar={() => confirmarEnt(m.entendimento!)} onAjustar={() => ajustarEnt(m.entendimento!)} />
                    )}
                    {m.documento && (
                      <DocumentoCartao d={m.documento} podeConfirmar={podeConfirmar} pensando={pensando} onConfirmar={() => confirmarDoc(m.documento!)} onAjustar={() => ajustarDoc(m.documento!)} />
                    )}
                    {m.plano?.comprovante &&<ComprovanteCartao titulo={m.plano.titulo} descricao={m.plano.descricao} c={m.plano.comprovante} />}
                    {m.plano && !m.plano.comprovante && (
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
            {msgs.length > 0 && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setAtalhos((v) => !v)}
                  aria-expanded={atalhos}
                  aria-controls="assistente-atalhos"
                  className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-medium text-ink-600 transition-colors hover:bg-paper hover:text-ink-900"
                >
                  <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={`transition-transform ${atalhos ? "rotate-180" : ""}`}>
                    <path d="M6 15l6-6 6 6" />
                  </svg>
                  {atalhos ? "Ocultar atalhos" : "Atalhos"}
                </button>
                {atalhos && (
                  <div id="assistente-atalhos">
                    <Atalhos onEscolher={enviar} desabilitado={pensando} compacto />
                  </div>
                )}
              </div>
            )}
            {podeConfirmar && (arquivo || erroArquivo) && (
              <div className="mb-2 space-y-1.5">
                {arquivo && (
                  <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink-700">
                    <Icon name="file" size={14} className="shrink-0 text-ink-500" />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{arquivo.name}</span>
                    <span className="shrink-0 tabular-nums text-ink-500">{formatBytes(arquivo.size)}</span>
                    <button type="button" onClick={() => escolherArquivo(null)} className="grid size-6 shrink-0 place-items-center rounded-md text-ink-500 hover:bg-white hover:text-ink-900" aria-label="Remover anexo">
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                )}
                {arquivo && (
                  <p className="flex items-start gap-1.5 px-1 text-[11px] leading-snug text-ink-600">
                    <Icon name="info" size={12} className="mt-px shrink-0" />
                    {AVISO_ANEXO}
                  </p>
                )}
                {erroArquivo && (
                  <p role="alert" className="px-1 text-[11px] leading-snug text-red-700">
                    {erroArquivo}
                  </p>
                )}
              </div>
            )}
            {documentoId && !arquivo && <p className="mb-2 px-1 text-[11px] leading-snug text-ink-600">Ajustando o documento: diga o que mudar.</p>}
            <form
              className="flex items-end gap-2 rounded-2xl border border-line-strong bg-white p-1.5 pl-3 transition-colors focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-100"
              onSubmit={(e) => {
                e.preventDefault();
                enviar(texto);
              }}
            >
              {podeConfirmar && (
                <>
                  <input ref={seletor} type="file" accept={ACEITOS} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)} />
                  <button
                    type="button"
                    onClick={() => seletor.current?.click()}
                    disabled={pensando}
                    className="grid size-9 shrink-0 place-items-center self-end rounded-xl text-ink-600 transition-colors hover:bg-paper hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Anexar documento"
                    title="Anexar documento (CSV, XLSX, PDF ou imagem, até 4 MB)"
                  >
                    <Icon name="file" size={16} />
                  </button>
                </>
              )}
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
                disabled={pensando || (!texto.trim() && !arquivo)}
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

/** Grade 2×2 de atalhos, como a área de ações de um app de banco. */
function Atalhos({ onEscolher, desabilitado, compacto }: { onEscolher: (q: string) => void; desabilitado: boolean; compacto?: boolean }) {
  return (
    <ul className={`grid grid-cols-2 gap-2 ${compacto ? "mt-1.5" : "mt-2.5"}`}>
      {ATALHOS.map((a) => (
        <li key={a.rotulo}>
          <button
            type="button"
            disabled={desabilitado}
            onClick={() => onEscolher(a.pergunta)}
            title={a.pergunta}
            className={`group flex h-full w-full rounded-xl border border-line bg-white text-left transition-[border-color,box-shadow] hover:border-brand-600/40 hover:shadow-[0_4px_14px_-8px_rgba(10,31,44,0.25)] disabled:cursor-not-allowed disabled:opacity-60 ${
              compacto ? "items-center gap-2.5 px-2.5 py-2" : "flex-col items-start gap-2.5 p-3.5"
            }`}
          >
            <span aria-hidden className={`grid shrink-0 place-items-center rounded-lg bg-ink-900 text-gold-300 transition-colors group-hover:bg-brand-700 ${compacto ? "size-7" : "size-9"}`}>
              <Icon name={a.icone} size={compacto ? 14 : 17} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight text-ink-900">{a.rotulo}</span>
              {!compacto && <span className="mt-1 block text-[11px] leading-snug text-ink-500">{a.pergunta}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Texto do assistente: parágrafos + linhas de extrato (rótulo à esquerda, valor à direita). Só texto, sem HTML. */
function TextoAssistente({ texto }: { texto: string }) {
  const blocos = blocosDoTexto(texto);
  return (
    <div className="space-y-2">
      {blocos.map((b, i) =>
        b.tipo === "texto" ? (
          <p key={i} className="whitespace-pre-line">
            {b.texto}
          </p>
        ) : (
          <dl key={i} className="-mx-1 divide-y divide-dashed divide-line rounded-lg bg-paper/70 px-3 py-0.5">
            {b.linhas.map((l, j) => (
              <div key={j} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="min-w-0 text-[13px] text-ink-600">{l.rotulo}</dt>
                <dd className="shrink-0 font-semibold text-ink-900">{l.valor}</dd>
              </div>
            ))}
          </dl>
        ),
      )}
    </div>
  );
}

/** Comprovante da ação confirmada, no formato de recibo de transferência. */
function ComprovanteCartao({ titulo, descricao, c }: { titulo: string; descricao: string; c: Comprovante }) {
  return (
    <div className="mt-2 drop-shadow-[0_4px_10px_rgba(10,31,44,0.12)]">
      <div className="comprovante bg-white tabular-nums" role="group" aria-label="Comprovante da ação">
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
            <Icon name="check" size={18} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold leading-tight text-ink-900">Ação realizada</p>
            <p className="text-xs text-ink-600">{titulo}</p>
          </div>
        </div>
        <p className="px-4 pb-3 text-[13px] leading-relaxed text-ink-700">{descricao}</p>
        <div aria-hidden className="comprovante-picote" />
        <dl className="space-y-1.5 px-4 py-3 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Protocolo</dt>
            <dd className="font-mono font-semibold tracking-wide text-ink-900">{c.protocolo}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Data e hora</dt>
            <dd className="text-right font-medium text-ink-900">
              {c.quando} <span className="text-ink-500">(Brasília)</span>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-ink-500">Confirmado por</dt>
            <dd className="min-w-0 truncate text-right font-medium text-ink-900">{c.por}</dd>
          </div>
        </dl>
        <p className="mx-4 mb-5 flex items-center justify-center gap-1.5 rounded-lg bg-brand-50 px-2 py-1.5 text-xs font-medium text-brand-800">
          <Icon name="chain" size={12} />
          Registrado na auditoria
        </p>
      </div>
    </div>
  );
}

const BLOCOS_ENT = [
  ["problema", "Problema"],
  ["diaADia", "No dia a dia"],
  ["jaExiste", "O que já existe"],
  ["novo", "O que seria novo"],
] as const;

/** Entendimento de um pedido, no mesmo formato de recibo do comprovante. Só texto. */
function EntendimentoCartao({
  e,
  podeConfirmar,
  pensando,
  onConfirmar,
  onAjustar,
}: {
  e: EntendimentoTela & { estado: EstadoEntendimento };
  podeConfirmar: boolean;
  pensando: boolean;
  onConfirmar: () => void;
  onAjustar: () => void;
}) {
  return (
    <div className="mt-2 drop-shadow-[0_4px_10px_rgba(10,31,44,0.12)]">
      <div className="comprovante bg-white" role="group" aria-label="Entendimento do pedido">
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full ${e.estado === "confirmado" ? "bg-brand-600 text-white" : "bg-ink-900 text-gold-300"}`}>
            <Icon name={e.estado === "confirmado" ? "check" : "sparkle"} size={16} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold leading-tight text-ink-900">{e.titulo}</p>
            <p className="text-xs text-ink-600">Meu entendimento · versão {e.versao}</p>
          </div>
        </div>
        <div aria-hidden className="comprovante-picote" />
        <dl className="space-y-2.5 px-4 py-3 text-[13px]">
          {BLOCOS_ENT.map(([k, r]) => (
            <div key={k}>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">{r}</dt>
              <dd className="mt-0.5 whitespace-pre-line leading-relaxed text-ink-800">{e[k]}</dd>
            </div>
          ))}
        </dl>
        <div className="px-4 pb-5">
          {e.estado === "pendente" && podeConfirmar ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" disabled={pensando} onClick={onConfirmar}>
                <Icon name="check" size={14} />
                Sim, é isso
              </button>
              <button type="button" className="btn-ghost" disabled={pensando} onClick={onAjustar}>
                Não, ajustar
              </button>
            </div>
          ) : e.estado === "confirmado" ? (
            <p className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-50 px-2 py-1.5 text-xs font-medium text-brand-800">
              <Icon name="check" size={12} />
              Registrado para a equipe avaliar
            </p>
          ) : e.estado === "ajustando" ? (
            <p className="text-xs text-ink-500">Em ajuste. A próxima versão aparece abaixo.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Entendimento de um documento anexado, no formato de recibo: "É isso?" com Sim e Ajustar. Só texto. */
function DocumentoCartao({
  d,
  podeConfirmar,
  pensando,
  onConfirmar,
  onAjustar,
}: {
  d: DocumentoTela & { estado: EstadoDocumento };
  podeConfirmar: boolean;
  pensando: boolean;
  onConfirmar: () => void;
  onAjustar: () => void;
}) {
  return (
    <div className="mt-2 drop-shadow-[0_4px_10px_rgba(10,31,44,0.12)]">
      <div className="comprovante bg-white" role="group" aria-label="Entendimento do documento">
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full ${d.estado === "salvo" ? "bg-brand-600 text-white" : "bg-ink-900 text-gold-300"}`}>
            <Icon name={d.estado === "salvo" ? "check" : "file"} size={16} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold leading-tight text-ink-900">{d.titulo}</p>
            <p className="text-xs text-ink-600">{ROTULO_FORMATO[d.formato] ?? d.formato} · É isso?</p>
          </div>
        </div>
        <p className="whitespace-pre-line px-4 pb-3 text-[13px] leading-relaxed text-ink-700">{d.explicacao}</p>
        <div aria-hidden className="comprovante-picote" />
        {d.colunas.length > 0 && (
          <dl className="space-y-1.5 px-4 py-3 text-[13px]">
            {d.colunas.slice(0, 20).map((c) => (
              <div key={c.nome} className="flex justify-between gap-3">
                <dt className="shrink-0 font-medium text-ink-900">{c.nome}</dt>
                <dd className="min-w-0 text-right text-ink-700">{c.significado || "—"}</dd>
              </div>
            ))}
            {d.colunas.length > 20 && <p className="text-xs text-ink-500">e mais {d.colunas.length - 20} colunas</p>}
          </dl>
        )}
        {(d.frequencia || d.uso) && (
          <dl className="space-y-1.5 px-4 pb-3 text-[13px]">
            {d.frequencia && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Frequência</dt>
                <dd className="text-right text-ink-900">{d.frequencia}</dd>
              </div>
            )}
            {d.uso && (
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-ink-500">Uso</dt>
                <dd className="text-right text-ink-900">{d.uso}</dd>
              </div>
            )}
          </dl>
        )}
        <div className="px-4 pb-5">
          {d.estado === "pendente" && podeConfirmar ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" disabled={pensando} onClick={onConfirmar}>
                <Icon name="check" size={14} />
                Sim, é isso
              </button>
              <button type="button" className="btn-ghost" disabled={pensando} onClick={onAjustar}>
                Ajustar
              </button>
            </div>
          ) : d.estado === "salvo" ? (
            <p className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-50 px-2 py-1.5 text-xs font-medium text-brand-800">
              <Icon name="check" size={12} />
              Salvo na biblioteca
            </p>
          ) : d.estado === "ajustando" ? (
            <p className="text-xs text-ink-500">Em ajuste. A próxima versão aparece abaixo.</p>
          ) : null}
        </div>
      </div>
    </div>
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
