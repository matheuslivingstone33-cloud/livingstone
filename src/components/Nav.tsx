"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";

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
            className={`group relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors ${
              active ? "bg-white/[0.08] font-medium text-white" : "text-brand-100/70 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            {/* Fio dourado indica a seção atual (na lateral em telas largas, embaixo no celular) */}
            <span
              aria-hidden="true"
              className={`absolute rounded-full bg-gold-400 transition-opacity max-md:inset-x-3 max-md:-bottom-0.5 max-md:h-0.5 md:inset-y-2 md:-left-3 md:w-0.5 ${active ? "opacity-100" : "opacity-0"}`}
            />
            <Icon name={n.icon} className={active ? "text-gold-400" : "text-brand-100/60 group-hover:text-brand-100"} />
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
