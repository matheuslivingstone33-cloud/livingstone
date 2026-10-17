import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dt } from "@/lib/format";
import { changeUserRole, createUser, revokeUserSessions, setUserActive } from "../../actions";
import { PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const roleLabel: Record<string, string> = { ADMIN: "Administrador", ANALISTA: "Analista", AUDITOR: "Auditor" };

export default async function UsuariosPage() {
  const s = await requireSession(["ADMIN"]);
  const users = await db.user.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: "asc" } });
  const now = new Date();

  return (
    <>
      <PageTitle title="Usuários" subtitle="Analistas operam os módulos; auditores apenas consultam e veem a trilha de auditoria" />
      <form action={createUser} className="card mb-6 grid gap-4 md:grid-cols-5">
        <input className="input" name="name" placeholder="Nome" required aria-label="Nome" />
        <input className="input" name="email" type="email" placeholder="E-mail" required aria-label="E-mail" />
        <input className="input" name="password" type="password" placeholder="Senha (mín. 12, letras e números)" minLength={12} required autoComplete="new-password" aria-label="Senha" />
        <select className="input" name="role" defaultValue="ANALISTA" aria-label="Perfil">
          <option value="ANALISTA">Analista</option>
          <option value="AUDITOR">Auditor</option>
          <option value="ADMIN">Administrador</option>
        </select>
        <SubmitButton pending="Salvando...">Adicionar</SubmitButton>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th>Ações</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === s.userId;
              const locked = u.lockedUntil && u.lockedUntil > now;
              return (
                <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                  <td>{u.name}{self && <span className="ml-2 text-xs text-slate-400">(você)</span>}</td>
                  <td>{u.email}</td>
                  <td>
                    {self ? (
                      roleLabel[u.role]
                    ) : (
                      <form action={changeUserRole.bind(null, u.id)} className="flex items-center gap-2">
                        <select className="input py-1" name="role" defaultValue={u.role} aria-label={`Perfil de ${u.name}`}>
                          <option value="ANALISTA">Analista</option>
                          <option value="AUDITOR">Auditor</option>
                          <option value="ADMIN">Administrador</option>
                        </select>
                        <button className="text-sm text-brand-600 hover:underline">Alterar</button>
                      </form>
                    )}
                  </td>
                  <td>
                    {!u.active ? <span className="badge bg-slate-100 text-slate-600">Desativado</span>
                      : locked ? <span className="badge bg-red-100 text-red-800">Bloqueado até {dt(u.lockedUntil)}</span>
                      : <span className="badge bg-emerald-100 text-emerald-800">Ativo</span>}
                  </td>
                  <td className="text-slate-500">{dt(u.lastLoginAt)}</td>
                  <td>
                    {!self && (
                      <div className="flex flex-wrap gap-3 text-sm">
                        <form action={setUserActive.bind(null, u.id, !u.active)}>
                          <button className="text-brand-600 hover:underline">{u.active ? "Desativar" : "Reativar"}</button>
                        </form>
                        <form action={revokeUserSessions.bind(null, u.id)}>
                          <button className="text-brand-600 hover:underline">{locked ? "Desbloquear" : "Encerrar sessões"}</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">Desativar, mudar o perfil ou encerrar sessões derruba os acessos abertos do usuário imediatamente.</p>
    </>
  );
}
