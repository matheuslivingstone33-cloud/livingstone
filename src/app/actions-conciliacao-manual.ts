"use server";

import { revalidatePath } from "next/cache";
import { audit, requireSession, type Session } from "@/lib/auth";
import { ConciliacaoManualError, validarJustificativa } from "@/lib/conciliacao-manual";
import { resolverItem, type Operacao } from "@/lib/servicos/conciliacao-manual";

export type ResolverState = { error?: string; ok?: string };

const ACAO_AUDIT: Record<Operacao["tipo"], string> = {
  VINCULAR: "conciliacao.vincular",
  ACEITAR_DIVERGENCIA: "conciliacao.aceitar_divergencia",
  BAIXAR: "conciliacao.baixar",
  REABRIR: "conciliacao.reabrir",
};
const OK: Record<Operacao["tipo"], string> = {
  VINCULAR: "Itens vinculados.",
  ACEITAR_DIVERGENCIA: "Divergência aceita.",
  BAIXAR: "Item baixado.",
  REABRIR: "Item reaberto.",
};

const id = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim();
  return /^[\w-]{1,64}$/.test(t) ? t : "";
};

async function executar(s: Session, montar: (nota: string) => Operacao | string, form: FormData): Promise<ResolverState> {
  let nota: string;
  try {
    nota = validarJustificativa(form.get("justification"));
  } catch (e) {
    return { error: (e as Error).message };
  }
  const op = montar(nota);
  if (typeof op === "string") return { error: op };
  try {
    const r = await resolverItem({ orgId: s.orgId, userId: s.userId, name: s.name }, op, new Date());
    const refs = r.outraReferencia ? `${r.reference} + ${r.outraReferencia}` : r.reference;
    await audit(s, ACAO_AUDIT[op.tipo], `${s.name} · ${refs} · ${nota.slice(0, 200)}`);
    revalidatePath(`/conciliacao/${r.reconciliationId}`);
    revalidatePath("/conciliacao");
    return { ok: OK[op.tipo] };
  } catch (e) {
    if (e instanceof ConciliacaoManualError) return { error: e.message };
    throw e;
  }
}

export async function vincularItens(_prev: ResolverState, form: FormData): Promise<ResolverState> {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  return executar(s, (nota) => {
    const itemId = id(form.get("itemId"));
    const outroId = id(form.get("outroId"));
    if (!itemId) return "Item inválido.";
    if (!outroId) return "Escolha o crédito não esperado a vincular.";
    return { tipo: "VINCULAR", itemId, outroId, nota };
  }, form);
}

export async function aceitarDivergencia(_prev: ResolverState, form: FormData): Promise<ResolverState> {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  return executar(s, (nota) => (id(form.get("itemId")) ? { tipo: "ACEITAR_DIVERGENCIA", itemId: id(form.get("itemId")), nota } : "Item inválido."), form);
}

export async function baixarItem(_prev: ResolverState, form: FormData): Promise<ResolverState> {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  return executar(s, (nota) => (id(form.get("itemId")) ? { tipo: "BAIXAR", itemId: id(form.get("itemId")), nota } : "Item inválido."), form);
}

export async function reabrirItem(_prev: ResolverState, form: FormData): Promise<ResolverState> {
  const s = await requireSession(["ADMIN"]);
  return executar(s, (nota) => (id(form.get("itemId")) ? { tipo: "REABRIR", itemId: id(form.get("itemId")), nota } : "Item inválido."), form);
}
