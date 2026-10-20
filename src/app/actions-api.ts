"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireSession } from "@/lib/auth";
import { AVAILABLE_SCOPES, generateKey, type ApiScope } from "@/lib/api-keys";

export type CreateKeyState = { secret?: string; name?: string; error?: string };

// Cria uma chave da instituição. O segredo volta só neste retorno e nunca é gravado nem auditado.
export async function createApiKey(_prev: CreateKeyState, form: FormData): Promise<CreateKeyState> {
  const s = await requireSession(["ADMIN"]);
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { error: "Dê um nome à chave (ex.: ERP financeiro)." };
  const scopes = form.getAll("scopes").map(String).filter((x): x is ApiScope => (AVAILABLE_SCOPES as readonly string[]).includes(x));
  if (!scopes.length) return { error: "Marque ao menos um escopo." };
  const active = await db.apiKey.count({ where: { orgId: s.orgId, revokedAt: null } });
  if (active >= 20) return { error: "Limite de 20 chaves ativas. Revogue as que não usa." };
  const k = generateKey();
  await db.apiKey.create({ data: { orgId: s.orgId, name, prefix: k.prefix, hash: k.hash, scopes: [...new Set(scopes)], createdById: s.userId } });
  await audit(s, "api.chave.criar", `${name} (prefixo ${k.prefix}, escopos ${scopes.join(", ")})`);
  revalidatePath("/configuracoes");
  return { secret: k.secret, name };
}

export async function revokeApiKey(form: FormData) {
  const s = await requireSession(["ADMIN"]);
  const id = String(form.get("id") ?? "").slice(0, 64);
  const key = await db.apiKey.findFirst({ where: { id, orgId: s.orgId, revokedAt: null }, select: { name: true, prefix: true } });
  const r = await db.apiKey.updateMany({ where: { id, orgId: s.orgId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count && key) await audit(s, "api.chave.revogar", `${key.name} (prefixo ${key.prefix})`);
  revalidatePath("/configuracoes");
}
