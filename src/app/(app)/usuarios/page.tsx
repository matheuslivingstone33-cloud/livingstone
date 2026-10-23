import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dt } from "@/lib/format";
import { changeUserRole, createUser, revokeUserSessions, setUserActive } from "../../actions";
import { PageTitle, CardHeader, TableCard, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PasswordField } from "@/components/PasswordField";
import { AjudaAba } from "@/components/AjudaAba";

const roleLabel: Record<string, string> = { ADMIN: "Administrador", ANALISTA: "Analista", AUDITOR: "Auditor" };

export default async function UsuariosPage() {
  const s = await requireSession(["ADMIN"]);
  const users = await db.user.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "asc" } });
  const now = new Date();

  return (
    <>
      <PageTitle eyebrow="Acesso" title="Usuários" subtitle="Analistas operam os módulos; auditores apenas consultam e veem a trilha de auditoria" />
      <AjudaAba aba="usuarios" />
      <form action={createUser} className="card mb-8 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr_auto_auto]">
        <div className="sm:col-span-2 lg:col-span-5">
          <CardHeader title="Adicionar usuário" />
        </div>
        <input className="input" name="name" placeholder="Nome" required aria-label="Nome" />
        <input className="input" name="email" type="email" placeholder="E-mail" required aria-label="E-mail" />
        <PasswordField name="password" placeholder="Senha" />
        <select className="input" name="role" defaultValue="ANALISTA" aria-label="Perfil">
          <option value="ANALISTA">Analista</option>
          <option value="AUDITOR">Auditor</option>
          <option value="ADMIN">Administrador</option>
        </select>
        <SubmitButton pending="Salvando...">Adicionar</SubmitButton>
      </form>
      <TableCard title="Equipe" meta={`${users.length} usuário(s)`}>
        <table className="table">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th>Ações</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === s.userId;
              const locked = u.lockedUntil && u.lockedUntil > now;
              return (
                <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                  <td className="whitespace-nowrap font-medium text-ink-900">{u.name}{self && <span className="badge ml-2 bg-gold-50 text-gold-700">você</span>}</td>
                  <td className="text-ink-600">{u.email}</td>
                  <td>
                    {self ? (
                      roleLabel[u.role]
                    ) : (
                      <form action={changeUserRole.bind(null, u.id)} className="flex items-center gap-2">
                        <select className="input min-h-9 w-auto py-1" name="role" defaultValue={u.role} aria-label={`Perfil de ${u.name}`}>
                          <option value="ANALISTA">Analista</option>
                          <option value="AUDITOR">Auditor</option>
                          <option value="ADMIN">Administrador</option>
                        </select>
                        <button className="link-action">Alterar</button>
                      </form>
                    )}
                  </td>
                  <td>
                    {!u.active ? <StatusBadge status="DESATIVADO" />
                      : locked ? <StatusBadge status="BLOQUEADO" label={`Bloqueado até ${dt(u.lockedUntil)}`} />
                      : <StatusBadge status="ATIVO" />}
                  </td>
                  <td className="whitespace-nowrap text-ink-500">{dt(u.lastLoginAt)}</td>
                  <td>
                    {!self && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <form action={setUserActive.bind(null, u.id, !u.active)}>
                          <button className={u.active ? "link-action text-red-700 hover:text-red-800" : "link-action"}>{u.active ? "Desativar" : "Reativar"}</button>
                        </form>
                        <form action={revokeUserSessions.bind(null, u.id)}>
                          <button className="link-action whitespace-nowrap">{locked ? "Desbloquear" : "Encerrar sessões"}</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableCard>
      <p className="hint mt-3">Desativar, mudar o perfil ou encerrar sessões derruba os acessos abertos do usuário imediatamente.</p>
    </>
  );
}
