import { requireSession } from "@/lib/auth";
import { changeOwnPassword } from "../../actions";
import { PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function ContaPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireSession();
  const { ok } = await searchParams;
  return (
    <>
      <PageTitle title="Minha conta" subtitle="Trocar a senha encerra suas sessões em outros dispositivos" />
      {ok && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Senha alterada.</p>}
      <form action={changeOwnPassword} className="card max-w-md space-y-4">
        <div>
          <label className="label" htmlFor="current">Senha atual</label>
          <input className="input" id="current" name="current" type="password" required autoComplete="current-password" />
        </div>
        <div>
          <label className="label" htmlFor="next">Nova senha</label>
          <input className="input" id="next" name="next" type="password" required minLength={12} autoComplete="new-password" />
          <p className="mt-1 text-xs text-slate-500">Mínimo de 12 caracteres, com letras e números.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirmar nova senha</label>
          <input className="input" id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" />
        </div>
        <SubmitButton pending="Salvando...">Trocar senha</SubmitButton>
      </form>
    </>
  );
}
