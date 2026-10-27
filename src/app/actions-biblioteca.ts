"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireSession } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { ID_RE } from "@/lib/assistente";
import { colunasSalvas, validarDocumento, type ColunaDoc } from "@/lib/biblioteca";

const BACK = "/biblioteca";

export type DocumentoLista = {
  id: string;
  titulo: string;
  formato: string;
  explicacao: string;
  colunas: ColunaDoc[];
  frequencia: string | null;
  uso: string | null;
  atualizadoEm: Date;
};

/** Documentos confirmados da instituição (qualquer perfil lê). */
export async function listarDocumentos(): Promise<DocumentoLista[]> {
  const s = await requireSession();
  const rows = await db.documentoBiblioteca.findMany({
    where: { orgId: s.orgId, status: "CONFIRMADO" },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, titulo: true, formato: true, explicacao: true, colunas: true, frequencia: true, uso: true, updatedAt: true },
  });
  return rows.map((r) => ({ ...r, colunas: colunasSalvas(r.colunas), atualizadoEm: r.updatedAt }));
}

/** Edição na tela: título, explicação, frequência, uso e o significado de cada coluna já registrada. */
export async function atualizarDocumento(id: string, form: FormData) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  if (typeof id !== "string" || !ID_RE.test(id)) fail(BACK, "Documento não encontrado.");
  const d = await db.documentoBiblioteca.findFirst({ where: { id, orgId: s.orgId, status: "CONFIRMADO" }, select: { id: true, cabecalho: true, colunas: true } });
  if (!d) fail(BACK, "Documento não encontrado.");
  const atuais = colunasSalvas(d.colunas);
  const colunas = atuais.map((c, i) => ({ nome: c.nome, significado: String(form.get(`col_${i}`) ?? c.significado) }));
  const v = validarDocumento(
    { titulo: form.get("titulo"), explicacao: form.get("explicacao"), frequencia: form.get("frequencia"), uso: form.get("uso"), colunas },
    Array.isArray(d.cabecalho) ? (d.cabecalho as string[]) : null,
  );
  if (!v.ok) fail(BACK, v.erro === "título inválido" ? "O título precisa ter ao menos 3 caracteres." : "A explicação é obrigatória.");
  const up = await db.documentoBiblioteca.updateMany({
    where: { id: d.id, orgId: s.orgId, status: "CONFIRMADO" },
    data: { titulo: v.doc.titulo, explicacao: v.doc.explicacao, colunas: v.doc.colunas, frequencia: v.doc.frequencia ?? null, uso: v.doc.uso ?? null, atualizadoPor: s.userId },
  });
  if (up.count !== 1) fail(BACK, "Documento não encontrado.");
  await audit(s, "biblioteca.atualizar", `Documento ${d.id} · ${v.doc.colunas.length} colunas`);
  revalidatePath(BACK);
}

export async function apagarDocumento(id: string) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  if (typeof id !== "string" || !ID_RE.test(id)) fail(BACK, "Documento não encontrado.");
  const r = await db.documentoBiblioteca.deleteMany({ where: { id, orgId: s.orgId } });
  if (r.count !== 1) fail(BACK, "Documento não encontrado.");
  await audit(s, "biblioteca.apagar", `Documento ${id}`);
  revalidatePath(BACK);
}
