import Link from "next/link";
import { Logo, LogoMark } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { ChainIllustration } from "@/components/Illustrations";
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
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_1fr]">
      <section className="on-ink surface-ink hidden flex-col justify-between p-12 lg:flex xl:p-16">
        <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-48 -left-48 h-[32rem] w-[32rem] rounded-full bg-brand-600/25 blur-3xl" aria-hidden="true" />
        <Link href="/" aria-label={`${BRAND.name}, página inicial`} className="relative w-fit rounded-xl">
          <Logo size={36} />
        </Link>
        <div className="rise relative">
          <p className="eyebrow flex items-center gap-3 text-gold-300">
            <span className="rule-gold" aria-hidden="true" />
            {BRAND.tagline}
          </p>
          <h2 className="font-display mt-5 max-w-md text-5xl font-semibold leading-[1.05] tracking-tight">
            Menos planilha.
            <br />
            <span className="text-gold-400">Mais decisão.</span>
          </h2>
          <ul className="mt-10 space-y-4 text-brand-100/85">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-gold-300">
                  <Icon name="check" size={12} strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative max-w-xs text-gold-300/80">
          <ChainIllustration />
          <p className="mt-2 text-xs text-brand-100/50">Cada ação registrada aponta para a anterior.</p>
        </div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <Link href="/" aria-label={`${BRAND.name}, página inicial`} className="mb-10 inline-flex rounded-xl lg:hidden">
            <LogoMark size={40} />
          </Link>
          <form action={login} className="space-y-5">
            <div>
              <p className="eyebrow">Acesso restrito</p>
              <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink-900">Entrar</h1>
              <p className="mt-2 text-sm text-ink-500">Acesse o painel da sua instituição</p>
            </div>
            {/* Mesma mensagem para senha errada e conta bloqueada: não revela quais e-mails existem */}
            {erro && (
              <p role="alert" className="notice notice-danger mb-0">
                <Icon name="alert" className="mt-px shrink-0" />
                <span>E-mail ou senha inválidos. Após 5 tentativas, o acesso fica bloqueado por 15 minutos.</span>
              </p>
            )}
            <div>
              <label className="label" htmlFor="email">E-mail</label>
              <input className="input min-h-11" id="email" name="email" type="email" required autoComplete="username" />
            </div>
            <div>
              <label className="label" htmlFor="password">Senha</label>
              <input className="input min-h-11" id="password" name="password" type="password" required autoComplete="current-password" />
            </div>
            <button className="btn min-h-11 w-full">
              <Icon name="lock" size={16} />
              Entrar
            </button>
            {showDemo && (
              <p className="notice notice-info mb-0 text-xs">
                <Icon name="info" size={16} className="shrink-0" />
                <span>
                  Ambiente de demonstração: <b>admin@demo.local</b> (senha definida em <code className="font-mono">prisma/seed.ts</code>).
                </span>
              </p>
            )}
            <p className="pt-2 text-center text-sm">
              <Link href="/" className="inline-flex items-center gap-1.5 rounded text-ink-500 hover:text-brand-700">
                <Icon name="back" size={14} />
                Voltar ao site
              </Link>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
