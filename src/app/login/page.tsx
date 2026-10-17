import Link from "next/link";
import { Logo, LogoMark } from "@/components/Logo";
import { BRAND } from "@/lib/brand";
import { login } from "../actions";

const points = [
  "Conciliação de CNAB 400, OFX e CSV em minutos",
  "Crédito, cobrança e PLD/COAF com decisão auditável",
  "Trilha de auditoria à prova de adulteração",
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const showDemo = process.env.NODE_ENV !== "production";
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="bg-grid relative hidden flex-col justify-between bg-ink-900 p-12 text-white lg:flex">
        <Link href="/" aria-label={`${BRAND.name}, página inicial`}>
          <Logo size={36} />
        </Link>
        <div>
          <h2 className="font-display max-w-md text-4xl font-semibold leading-tight tracking-tight">Menos planilha. Mais decisão.</h2>
          <ul className="mt-8 space-y-3 text-brand-100/85">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-brand-100/50">{BRAND.tagline}</p>
      </section>

      <section className="flex items-center justify-center bg-white p-6">
        <form action={login} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden">
            <LogoMark size={40} />
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900">Entrar</h1>
            <p className="mt-1 text-sm text-slate-500">Acesse o painel da sua instituição</p>
          </div>
          {/* Mesma mensagem para senha errada e conta bloqueada: não revela quais e-mails existem */}
          {erro && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              E-mail ou senha inválidos. Após 5 tentativas, o acesso fica bloqueado por 15 minutos.
            </p>
          )}
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="username" />
          </div>
          <div>
            <label className="label" htmlFor="password">Senha</label>
            <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <button className="btn w-full py-2.5">Entrar</button>
          {showDemo && (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
              Ambiente de demonstração: <b>admin@demo.local</b> (senha definida em <code>prisma/seed.ts</code>).
            </p>
          )}
          <p className="text-center text-sm">
            <Link href="/" className="text-slate-500 hover:text-brand-600">← Voltar ao site</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
