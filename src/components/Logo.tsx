import { BRAND } from "@/lib/brand";

// Marca: bússola (exploradora de dados) em dourado sobre verde-petróleo
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="9" fill="#0f766e" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" stroke="#ffffff" strokeOpacity="0.12" />
      <circle cx="16" cy="16" r="9.5" stroke="#ecd48a" strokeOpacity="0.55" strokeWidth="1.4" />
      <path d="M16 4.6v2M16 25.4v2M4.6 16h2M25.4 16h2" stroke="#ecd48a" strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M16 6.8 19.2 16 16 25.2 12.8 16 16 6.8Z" fill="#e0b84a" />
      <path d="M16 6.8 19.2 16H12.8L16 6.8Z" fill="#fff" fillOpacity="0.92" />
      <circle cx="16" cy="16" r="1.5" fill="#0a2a30" />
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
