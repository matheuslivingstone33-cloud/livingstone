import { audit, getSession, verifyAuditChain } from "@/lib/auth";
import { deriveReceiptSecret, signReceipt } from "@/lib/audit-chain";

// Recibo de integridade: assina (HMAC) o último seq/hash da corrente conferida
export async function GET() {
  const s = await getSession();
  if (!s) return new Response("Não autorizado", { status: 401 });
  if (!["ADMIN", "AUDITOR"].includes(s.role)) return new Response("Sem permissão", { status: 403 });
  let secret: Buffer;
  try {
    secret = deriveReceiptSecret(process.env);
  } catch {
    return new Response("Recibo indisponível: segredo do ambiente não configurado.", { status: 500 });
  }
  // A emissão entra na corrente antes; o recibo cobre inclusive este registro
  await audit(s, "auditoria.recibo", "Emissão de recibo de integridade");
  const chain = await verifyAuditChain(s.orgId);
  if (!chain.ok || chain.lastSeq < 1) {
    const p = chain.problema;
    return new Response(
      `Recibo não emitido: a corrente de auditoria não está íntegra${p ? ` (${p.tipo}${p.seq != null ? ` no seq ${p.seq}` : ""}, registro ${p.id})` : ""}. Preserve o banco e acione a segurança da informação.`,
      { status: 409, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } },
    );
  }
  const receipt = signReceipt(secret, { orgId: s.orgId, seq: chain.lastSeq, hash: chain.lastHash, emitidoEm: new Date().toISOString() });
  return new Response(JSON.stringify(receipt, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="recibo-auditoria-${s.orgId}-${receipt.seq}.json"`,
      "cache-control": "no-store",
    },
  });
}
