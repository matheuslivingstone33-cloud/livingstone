import { BRAND } from "@/lib/brand";

// Marca: bússola (exploradora de dados) em dourado sobre verde-petróleo
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0f766e" />
      <circle cx="16" cy="16" r="9.5" stroke="#ecd48a" strokeOpacity="0.55" strokeWidth="1.4" />
      <path d="M16 6.8 19.2 16 16 25.2 12.8 16 16 6.8Z" fill="#e0b84a" />
      <path d="M16 6.8 19.2 16H12.8L16 6.8Z" fill="#fff" fillOpacity="0.92" />
      <circle cx="16" cy="16" r="1.5" fill="#0a2a30" />
    </svg>
  );
}

export function Logo({ size = 32, subtitle, light = true }: { size?: number; subtitle?: string; light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={size} />
      <div className="leading-tight">
        <div className={`font-display text-xl font-semibold tracking-tight ${light ? "text-white" : "text-ink-900"}`}>{BRAND.name}</div>
        {subtitle && <div className={`text-xs ${light ? "text-brand-200/80" : "text-slate-500"}`}>{subtitle}</div>}
      </div>
    </div>
  );
}
