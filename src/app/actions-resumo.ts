"use server";

import { revalidatePath } from "next/cache";
import { clientIp, requireSession } from "@/lib/auth";
import { atualizarResumoServico } from "@/lib/servicos/resumo";
import { fail } from "@/lib/errors";

// Atualiza o resumo do dia do painel. Só quem opera; o auditor vê o último resumo salvo.
export async function atualizarResumo() {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const r = await atualizarResumoServico({ orgId: s.orgId, userId: s.userId, nome: s.name, ip: await clientIp() });
  if (r === "travado") fail("/dashboard", "O resumo já está sendo atualizado. Aguarde alguns segundos e recarregue a página.");
  revalidatePath("/dashboard");
}
