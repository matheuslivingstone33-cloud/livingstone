import Link from "next/link";
import { Suspense } from "react";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/Nav";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { Assistente } from "@/components/Assistente";
import { requireSession } from "@/lib/auth";
import { aiProvider } from "@/lib/ai";
import { db } from "@/lib/db";
import { podeVerPedidos } from "@/lib/pedidos";
import { logout } from "../actions";

const nav = [
  { href: "/dashboard", label: "Painel", icon: "painel" },
  { href: "/conciliacao", label: "Conciliação", icon: "conciliacao" },
  { href: "/credito", label: "Análise de crédito", icon: "credito" },
  { href: "/cobranca", label: "Cobrança", icon: "cobranca" },
  { href: "/pld", label: "PLD / COAF", icon: "pld" },
  { href: "/legado", label: "Código legado", icon: "legado" },
  { href: "/auditoria", label: "Auditoria", icon: "auditoria", roles: ["ADMIN", "AUDITOR"] },
  { href: "/usuarios", label: "Usuários", icon: "usuarios", roles: ["ADMIN"] },
  { href: "/configuracoes", label: "Configurações", icon: "configuracoes", roles: ["ADMIN"] },
];

const roleLabel: Record<string, string> = { ADMIN: "Administrador", ANALISTA: "Analista", AUDITOR: "Auditor" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const [org, eu] = await Promise.all([
    db.organization.findUnique({ where: { id: s.orgId } }),
    db.user.findFirst({ where: { id: s.userId, orgId: s.orgId }, select: { email: true } }),
  ]);
  const itens = [...nav.filter((n) => !n.roles || n.roles.includes(s.role)), ...(podeVerPedidos(eu?.email, process.env.PEDIDOS_VIEWERS) ? [{ href: "/pedidos", label: "Pedidos", icon: "sparkle" }] : [])];
  const demo = aiProvider() === "demo";
  const initials = s.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  const aiTitle = demo ? "IA não configurada; análises usam regras locais" : undefined;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 text-sm font-medium text-ink-900 shadow-lift focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <aside className="on-ink surface-ink bg-ink-950 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:overflow-y-auto">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" aria-hidden="true" />
        <div className="relative px-5 pb-3 pt-5 md:pb-7 md:pt-6">
          <Logo subtitle={org?.name} />
        </div>
        <p className="eyebrow relative hidden px-6 pb-2 text-brand-100/45 md:block">Módulos</p>
        <nav className="relative flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-6" aria-label="Módulos">
          <NavLinks items={itens} />
        </nav>
        <div className="relative hidden border-t border-white/10 px-6 py-4 md:block">
          <span className={`inline-flex items-center gap-2 text-xs ${demo ? "text-gold-300" : "text-brand-200"}`} title={aiTitle}>
            <span className={`h-1.5 w-1.5 rounded-full ${demo ? "bg-gold-400" : "bg-brand-400"}`} aria-hidden="true" />
            {demo ? "IA: regras locais" : "IA: Claude ativo"}
          </span>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/85 px-4 py-2.5 backdrop-blur-md md:justify-end md:px-8">
          <Badge tone={demo ? "warning" : "success"} className="md:hidden" title={aiTitle}>
            {demo ? "IA: regras locais" : "IA: Claude ativo"}
          </Badge>
          <div className="flex items-center gap-2 text-sm md:gap-3">
            <Link href="/conta" className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 text-ink-600 transition-colors hover:bg-white hover:text-ink-900">
              <span className="font-display flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-gold-300 ring-2 ring-white">
                {initials}
              </span>
              <span className="hidden leading-tight sm:block">
                <span className="block font-medium text-ink-900">{s.name}</span>
                <span className="block text-xs text-ink-500">{roleLabel[s.role]}</span>
              </span>
            </Link>
            <form action={logout}>
              <button className="btn-ghost" aria-label="Sair da conta">
                <Icon name="logout" size={16} />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </form>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
          <Suspense>
            <ErrorBanner />
          </Suspense>
          {children}
        </main>
      </div>
      <Assistente podeConfirmar={s.role === "ADMIN" || s.role === "ANALISTA"} comIa={!demo} nome={s.name} perfil={roleLabel[s.role] ?? s.role} instituicao={org?.name ?? ""} />
    </div>
  );
}
