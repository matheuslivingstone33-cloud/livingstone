import { requireSession, verifyAuditChain } from "@/lib/auth";
import { db } from "@/lib/db";
import { dt } from "@/lib/format";
import { PageTitle, Empty, TableCard } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ChainIllustration } from "@/components/Illustrations";

export default async function AuditoriaPage() {
  const s = await requireSession(["ADMIN", "AUDITOR"]);
  const [logs, chain] = await Promise.all([
    db.auditLog.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "desc" }, take: 300, include: { user: true } }),
    verifyAuditChain(s.orgId),
  ]);

  return (
    <>
      <PageTitle eyebrow="Auditoria" title="Trilha de auditoria" subtitle="Registro de todas as ações realizadas na plataforma (últimas 300)" />
      <div
        role="status"
        className={`mb-6 flex flex-col gap-4 rounded-2xl border p-5 text-sm sm:flex-row sm:items-center ${chain.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`}
      >
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${chain.ok ? "bg-emerald-600 text-white" : "bg-red-700 text-white"}`}>
          <Icon name={chain.ok ? "chain" : "alert"} size={22} />
        </span>
        <div className="min-w-0 flex-1 leading-relaxed">
        {chain.ok ? (
          <>Integridade verificada: os {chain.checked} registros encadeados estão intactos. Nenhum foi alterado ou apagado.</>
        ) : (
          <>
            <b>Alerta de integridade:</b> a corrente de auditoria está quebrada no registro de {dt(chain.brokenAt.createdAt)} ({chain.brokenAt.action}).
            Um registro foi alterado ou apagado diretamente no banco de dados. Preserve o banco e acione a segurança da informação.
          </>
        )}
        </div>
        <div className={`hidden w-44 shrink-0 lg:block ${chain.ok ? "text-emerald-700" : "text-red-700"}`}>
          <ChainIllustration />
        </div>
      </div>
      <TableCard title="Registros" meta={`${logs.length} registro(s)`}>
        {logs.length ? (
          <table className="table">
            <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Detalhe</th><th>IP</th></tr></thead>
            <tbody>
              {logs.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap tabular-nums text-ink-500">{dt(a.createdAt)}</td>
                  <td className="whitespace-nowrap font-medium text-ink-900">{a.user?.name ?? "Sistema / devedor"}</td>
                  <td><span className="rounded-md bg-paper-2 px-1.5 py-0.5 font-mono text-xs text-ink-700">{a.action}</span></td>
                  <td className="min-w-56 text-ink-700">{a.detail}</td>
                  <td className="font-mono text-xs text-ink-500">{a.ip ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Sem registros.</Empty>
        )}
      </TableCard>
    </>
  );
}
