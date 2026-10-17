import { requireSession, verifyAuditChain } from "@/lib/auth";
import { db } from "@/lib/db";
import { dt } from "@/lib/format";
import { PageTitle, Empty } from "@/components/ui";

export default async function AuditoriaPage() {
  const s = await requireSession(["ADMIN", "AUDITOR"]);
  const [logs, chain] = await Promise.all([
    db.auditLog.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" }, take: 300, include: { user: true } }),
    verifyAuditChain(s.orgId),
  ]);

  return (
    <>
      <PageTitle title="Trilha de auditoria" subtitle="Registro de todas as ações realizadas na plataforma (últimas 300)" />
      <div
        role="status"
        className={`mb-4 rounded-lg border px-4 py-3 text-sm ${chain.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"}`}
      >
        {chain.ok ? (
          <>Integridade verificada: os {chain.checked} registros encadeados estão intactos. Nenhum foi alterado ou apagado.</>
        ) : (
          <>
            <b>Alerta de integridade:</b> a corrente de auditoria está quebrada no registro de {dt(chain.brokenAt.createdAt)} ({chain.brokenAt.action}).
            Um registro foi alterado ou apagado diretamente no banco de dados. Preserve o banco e acione a segurança da informação.
          </>
        )}
      </div>
      <div className="card overflow-x-auto">
        {logs.length ? (
          <table className="table">
            <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Detalhe</th><th>IP</th></tr></thead>
            <tbody>
              {logs.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-slate-500">{dt(a.createdAt)}</td>
                  <td>{a.user?.name ?? "Sistema / devedor"}</td>
                  <td className="font-mono text-xs">{a.action}</td>
                  <td>{a.detail}</td>
                  <td className="font-mono text-xs text-slate-400">{a.ip ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Sem registros.</Empty>
        )}
      </div>
    </>
  );
}
