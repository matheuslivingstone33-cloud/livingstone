import { requireSession, verifyAuditChain } from "@/lib/auth";
import { db } from "@/lib/db";
import { dt } from "@/lib/format";
import { AUDIT_PAGE_SIZE, auditWhere, filtersQuery, parseAuditFilters } from "@/lib/audit-chain";
import { PageTitle, Empty, TableCard, Notice, CardHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ChainIllustration } from "@/components/Illustrations";
import { ConferirRecibo } from "@/components/ConferirRecibo";

// Tempo máximo da função na Vercel (actions e exportações longas)
export const maxDuration = 60;

const PROBLEMA: Record<string, string> = {
  quebra: "um registro foi alterado (o hash não confere)",
  lacuna: "falta um registro na sequência (apagado)",
  duplicado: "há número de sequência repetido",
  sem_hash: "há registro sem hash depois do início da sequência",
};

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession(["ADMIN", "AUDITOR"]);
  const f = parseAuditFilters(await searchParams);
  const where = auditWhere(s.orgId, f);
  const [logs, total, chain, actions, users] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.pagina - 1) * AUDIT_PAGE_SIZE, take: AUDIT_PAGE_SIZE, include: { user: true } }),
    db.auditLog.count({ where }),
    verifyAuditChain(s.orgId),
    db.auditLog.groupBy({ by: ["action"], where: { orgId: s.orgId }, orderBy: { action: "asc" } }),
    db.user.findMany({ where: { orgId: s.orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const p = chain.problema;

  return (
    <>
      <PageTitle eyebrow="Auditoria" title="Trilha de auditoria" subtitle="Registro de todas as ações realizadas na plataforma" />
      <div
        role={chain.ok ? "status" : "alert"}
        className={`notice ${chain.ok ? "notice-success" : "notice-danger"} mb-6 flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center`}
      >
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${chain.ok ? "bg-emerald-600 text-white" : "bg-red-700 text-white"}`}>
          <Icon name={chain.ok ? "chain" : "alert"} size={22} />
        </span>
        <div className="min-w-0 flex-1 space-y-1 leading-relaxed">
          {chain.ok ? (
            <p>Integridade verificada: corrente íntegra, {chain.checked} registros conferidos sem quebra{chain.lastSeq ? ` (último seq ${chain.lastSeq})` : ""}.</p>
          ) : (
            <p>
              <b>Alerta de integridade:</b> a corrente está quebrada{p?.seq != null ? ` no seq ${p.seq}` : ""} (registro {p?.id}): {p ? PROBLEMA[p.tipo] : ""}.
              Isso indica alteração direta no banco de dados. Preserve o banco e acione a segurança da informação.
            </p>
          )}
          {chain.legacy > 0 && (
            <p className="text-xs">{chain.legacy} registro(s) antigo(s) sem hash: legado anterior ao encadeamento, listado mas não coberto pela verificação.</p>
          )}
        </div>
        <div className={`hidden w-44 shrink-0 lg:block ${chain.ok ? "text-emerald-700" : "text-red-700"}`}>
          <ChainIllustration />
        </div>
      </div>

      <section className="card mb-6">
        <CardHeader title="Recibo de integridade" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 text-sm text-ink-700">
            <p>
              O recibo é um arquivo assinado com o último número de sequência e o hash da corrente. Guarde-o fora do sistema e confira depois:
              se alguém alterar ou apagar registros até aquele ponto, a conferência acusa.
            </p>
            <p className="text-xs text-ink-500">
              Limites: a assinatura protege contra adulteração por quem não tem o segredo do ambiente (quem controla o servidor pode emitir recibos novos);
              o truncamento só é detectado até o seq coberto pelo recibo, então emita recibos com frequência.
            </p>
            <div className="flex flex-wrap gap-2">
              <a className="btn" href="/api/auditoria/recibo" download>
                <Icon name="download" size={16} /> Baixar recibo de integridade
              </a>
              <a className="btn btn-ghost" href={`/api/auditoria/csv?${filtersQuery(f)}`} download>
                <Icon name="download" size={16} /> Exportar CSV
              </a>
            </div>
          </div>
          <ConferirRecibo />
        </div>
      </section>

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-44">
          <label className="label" htmlFor="f-acao">Ação</label>
          <select className="input" id="f-acao" name="acao" defaultValue={f.action}>
            <option value="">Todas</option>
            {actions.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}
          </select>
        </div>
        <div className="min-w-44">
          <label className="label" htmlFor="f-usuario">Usuário</label>
          <select className="input" id="f-usuario" name="usuario" defaultValue={f.userId}>
            <option value="">Todos</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-de">De</label>
          <input className="input" id="f-de" name="de" type="date" defaultValue={f.de} />
        </div>
        <div>
          <label className="label" htmlFor="f-ate">Até</label>
          <input className="input" id="f-ate" name="ate" type="date" defaultValue={f.ate} />
        </div>
        <button className="btn">Filtrar</button>
        <a className="btn btn-ghost" href="/auditoria">Limpar</a>
      </form>

      {f.pagina > pages && total > 0 && <Notice tone="info">Página fora do intervalo. <a className="underline" href={`/auditoria?${filtersQuery(f)}`}>Voltar ao início</a>.</Notice>}

      <TableCard title="Registros" meta={`${total} registro(s) · página ${f.pagina} de ${pages}`}>
        {logs.length ? (
          <table className="table">
            <thead><tr><th>Seq</th><th>Data</th><th>Usuário</th><th>Ação</th><th>Detalhe</th><th>IP</th></tr></thead>
            <tbody>
              {logs.map((a) => (
                <tr key={a.id}>
                  <td className="tabular-nums text-ink-500">{a.seq ?? (a.hash ? "v1" : "legado")}</td>
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
          <Empty>Sem registros para estes filtros.</Empty>
        )}
      </TableCard>
      {pages > 1 && (
        <nav aria-label="Paginação" className="mt-4 flex items-center justify-between text-sm">
          {f.pagina > 1 ? <a className="btn btn-ghost" href={`/auditoria?${filtersQuery(f, { pagina: f.pagina - 1 })}`}>← Anterior</a> : <span />}
          {f.pagina < pages ? <a className="btn btn-ghost" href={`/auditoria?${filtersQuery(f, { pagina: f.pagina + 1 })}`}>Próxima →</a> : <span />}
        </nav>
      )}
    </>
  );
}
