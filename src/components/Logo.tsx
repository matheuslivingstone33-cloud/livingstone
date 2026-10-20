import { BRAND } from "@/lib/brand";
import { LOGO } from "@/lib/logo-geometria";

// Marca "Encaixe": duas peças que se encaixam (conciliação). Geometria em src/lib/logo-geometria.ts
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox={LOGO.viewBox} fill="none" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx={LOGO.fundo.rx} fill={LOGO.fundo.cor} />
      <rect x="0.5" y="0.5" width="31" height="31" rx={LOGO.fundo.rx - 0.5} stroke={LOGO.borda.cor} strokeOpacity={LOGO.borda.opacidade} />
      <path d={LOGO.pecaOuro.d} fill={LOGO.pecaOuro.cor} />
      <path d={LOGO.pecaVerde.d} fill={LOGO.pecaVerde.cor} />
    </svg>
  );
}

export function Logo({ size = 32, subtitle, light = true }: { size?: number; subtitle?: string; light?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <LogoMark size={size} />
      <div className="min-w-0 leading-tight">
        <div className={`font-display text-xl font-semibold tracking-tight ${light ? "text-white" : "text-ink-900"}`}>{BRAND.name}</div>
        {subtitle && <div className={`truncate text-xs ${light ? "text-brand-100/70" : "text-ink-500"}`}>{subtitle}</div>}
      </div>
    </div>
  );
}
