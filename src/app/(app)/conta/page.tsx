import { requireSession } from "@/lib/auth";
import { changeOwnPassword } from "../../actions";
import { PageTitle, Notice, CardHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PasswordField } from "@/components/PasswordField";

export default async function ContaPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireSession();
  const { ok } = await searchParams;
  return (
    <>
      <PageTitle eyebrow="Conta" title="Minha conta" subtitle="Trocar a senha encerra suas sessões em outros dispositivos" />
      {ok && <Notice>Senha alterada.</Notice>}
      <form action={changeOwnPassword} className="card max-w-md space-y-4">
        <CardHeader title="Trocar senha" />
        <div>
          <label className="label" htmlFor="current">Senha atual</label>
          <input className="input" id="current" name="current" type="password" required autoComplete="current-password" />
        </div>
        <div>
          <label className="label" htmlFor="next">Nova senha</label>
          <PasswordField id="next" name="next" />
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
