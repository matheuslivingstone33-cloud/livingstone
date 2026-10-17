import Link from "next/link";
import { Suspense } from "react";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/Nav";
import { requireSession } from "@/lib/auth";
import { aiProvider } from "@/lib/ai";
import { db } from "@/lib/db";
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
  const org = await db.organization.findUnique({ where: { id: s.orgId } });
  const demo = aiProvider() === "demo";
  const initials = s.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="bg-ink-900 text-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto">
        <div className="p-5 pb-4">
          <Logo subtitle={org?.name} />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col" aria-label="Módulos">
          <NavLinks items={nav.filter((n) => !n.roles || n.roles.includes(s.role))} />
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-6 py-3 backdrop-blur">
          <span
            className={`badge ${demo ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
            title={demo ? "Configure ANTHROPIC_API_KEY no .env para ativar a IA real" : undefined}
          >
            {demo ? "IA: modo demonstração" : "IA: Claude ativo"}
          </span>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/conta" className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{initials}</span>
              <span className="hidden sm:inline">
                {s.name} · {roleLabel[s.role]}
              </span>
            </Link>
            <form action={logout}>
              <button className="btn-ghost">Sair</button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-8">
          <Suspense>
            <ErrorBanner />
          </Suspense>
          {children}
        </main>
      </div>
    </div>
  );
}
