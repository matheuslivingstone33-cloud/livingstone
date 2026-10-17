"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Ícones de traço (24x24), um por módulo
const ICONS: Record<string, string> = {
  painel: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  conciliacao: "M7 7h13M7 7l3-3M7 7l3 3M17 17H4m13 0-3-3m3 3-3 3",
  credito: "M3 7h18v10H3V7Zm0 4h18M7 15h3",
  cobranca: "M12 3v18M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5S9.8 10 12 10s4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5",
  pld: "M12 3 4 6v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-3Zm-3 9 2 2 4-4",
  legado: "m8 8-4 4 4 4m8-8 4 4-4 4m-3-10-2 12",
  auditoria: "M9 4h6l1 2h3v14H5V6h3l1-2Zm-1 9h8m-8 4h5",
  usuarios: "M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 8v-1a4 4 0 0 0-3-3.9M16 4.2a3.5 3.5 0 0 1 0 6.6",
  configuracoes: "M4 7h10m4 0h2M4 17h2m4 0h10M14 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM6 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z",
};

export function NavLinks({ items }: { items: { href: string; label: string; icon: string }[] }) {
  const path = usePathname();
  return (
    <>
      {items.map((n) => {
        const active = path === n.href || path.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
              active ? "bg-white/10 font-medium text-white ring-1 ring-white/10" : "text-brand-100/75 hover:bg-white/5 hover:text-white"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "#e0b84a" : "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICONS[n.icon]} />
            </svg>
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
