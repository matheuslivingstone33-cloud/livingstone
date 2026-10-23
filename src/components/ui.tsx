import Link from "next/link";
import { Sparkline } from "@/components/charts";
import { Icon } from "@/components/Icon";

export function PageTitle({
  title,
  subtitle,
  action,
  eyebrow,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  eyebrow?: string;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-6">
      <div className="min-w-0 max-w-3xl">
        {back ? (
          <Link href={back.href} className="mb-3 inline-flex items-center gap-1.5 rounded text-xs font-medium text-ink-500 hover:text-brand-700">
            <Icon name="back" size={14} />
            {back.label}
          </Link>
        ) : (
          eyebrow && (
            <p className="eyebrow mb-3 flex items-center gap-3">
              <span className="rule-gold" aria-hidden="true" />
              {eyebrow}
            </p>
          )
        )}
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-balance text-ink-900 md:text-[2.25rem]">{title}</h1>
        {subtitle && <p className="mt-2 text-sm leading-relaxed text-pretty text-ink-500 md:text-[15px]">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

/** Cabeçalho de cartão: título à esquerda, ação/metadado à direita, separado por fio. */
export function CardHeader({ title, children, as: Tag = "h2" }: { title: React.ReactNode; children?: React.ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="card-header">
      <Tag className="card-title">{title}</Tag>
      {children && <div className="text-xs text-ink-500">{children}</div>}
    </div>
  );
}

/** Link "ver mais" padronizado para cabeçalhos de cartão. */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline">
      {children}
      <Icon name="arrow" size={14} />
    </Link>
  );
}

export function Stat({
  label,
  value,
  tone = "slate",
  href,
  hint,
  trend,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  href?: string;
  hint?: React.ReactNode;
  trend?: number[];
}) {
  const tones: Record<string, string> = {
    slate: "text-ink-900",
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-700",
    blue: "text-brand-700",
  };
  // Marcador de cor ao lado do rótulo: reforça o tom sem depender só da cor do número
  const marks: Record<string, string> = {
    slate: "bg-line-strong",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    blue: "bg-brand-500",
  };
  const body = (
    <div
      className={`group relative h-full rounded-2xl border border-line bg-white p-4 shadow-card transition md:p-5 ${
        href ? "hover:-translate-y-px hover:border-line-strong hover:shadow-lift motion-reduce:hover:translate-y-0" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${marks[tone] ?? marks.slate}`} aria-hidden="true" />
        <span className="eyebrow min-w-0 leading-snug">{label}</span>
        {href && <Icon name="arrow" size={14} className="ml-auto shrink-0 text-ink-500/50 transition-colors group-hover:text-brand-700" />}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className={`min-w-0 break-words text-xl font-semibold tracking-tight tabular-nums md:text-2xl ${tones[tone] ?? tones.slate}`}>{value}</div>
        {trend && <Sparkline values={trend} />}
      </div>
      {hint && <div className="mt-1.5 text-xs leading-snug text-ink-500">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}

const statusTone: Record<string, string> = {
  CONCILIADO: "bg-emerald-50 text-emerald-800",
  APROVAR: "bg-emerald-50 text-emerald-800",
  DIVERGENTE: "bg-amber-50 text-amber-800",
  ANALISAR: "bg-amber-50 text-amber-800",
  PENDENTE: "bg-red-50 text-red-800",
  RECUSAR: "bg-red-50 text-red-800",
  NAO_ESPERADO: "bg-violet-50 text-violet-800",
  VINCULADO: "bg-sky-50 text-sky-800",
  BAIXADO: "bg-slate-100 text-slate-700",
  APROVADO: "bg-emerald-50 text-emerald-800",
  RECUSADO: "bg-red-50 text-red-800",
  IA_USADA: "bg-emerald-50 text-emerald-800",
  IA_REJEITADA: "bg-amber-50 text-amber-800",
  IA_FALHOU: "bg-amber-50 text-amber-800",
  IA_LIMITE: "bg-slate-100 text-slate-700",
  LOTE_PROCESSANDO: "bg-sky-50 text-sky-800",
  LOTE_CONCLUIDO: "bg-emerald-50 text-emerald-800",
  LOTE_FALHOU: "bg-red-50 text-red-800",
};
const statusDot: Record<string, string> = {
  CONCILIADO: "bg-emerald-500",
  APROVAR: "bg-emerald-500",
  DIVERGENTE: "bg-amber-500",
  ANALISAR: "bg-amber-500",
  PENDENTE: "bg-red-500",
  RECUSAR: "bg-red-500",
  NAO_ESPERADO: "bg-violet-500",
  VINCULADO: "bg-sky-500",
  BAIXADO: "bg-slate-400",
  APROVADO: "bg-emerald-500",
  RECUSADO: "bg-red-500",
  IA_USADA: "bg-emerald-500",
  IA_REJEITADA: "bg-amber-500",
  IA_FALHOU: "bg-amber-500",
  IA_LIMITE: "bg-slate-400",
  LOTE_PROCESSANDO: "bg-sky-500",
  LOTE_CONCLUIDO: "bg-emerald-500",
  LOTE_FALHOU: "bg-red-500",
};
const statusLabel: Record<string, string> = {
  CONCILIADO: "Conciliado",
  DIVERGENTE: "Divergente",
  PENDENTE: "Não pago",
  NAO_ESPERADO: "Não esperado",
  VINCULADO: "Vinculado",
  BAIXADO: "Baixado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
  APROVAR: "Aprovar",
  ANALISAR: "Análise humana",
  RECUSAR: "Recusar",
  IA_USADA: "Versão exibida: IA (conferida)",
  IA_REJEITADA: "Versão padrão (IA rejeitada)",
  IA_FALHOU: "Versão padrão (IA falhou)",
  IA_LIMITE: "Versão padrão (teto diário de IA atingido)",
  LOTE_PROCESSANDO: "Processando",
  LOTE_CONCLUIDO: "Concluído",
  LOTE_FALHOU: "Falhou / interrompido",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${statusTone[status] ?? "bg-slate-100 text-slate-700"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statusDot[status] ?? "bg-slate-400"}`} aria-hidden="true" />
      {statusLabel[status] ?? status}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <svg width="56" height="40" viewBox="0 0 56 40" fill="none" aria-hidden="true">
        <rect x="0.75" y="0.75" width="54.5" height="38.5" rx="7" className="fill-paper stroke-line-strong" strokeWidth="1.5" />
        <path d="M10 13h22M10 20h36M10 27h28" className="stroke-line-strong" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="44" cy="13" r="3" className="fill-gold-300" />
      </svg>
      <p className="max-w-sm text-sm text-ink-500">{children}</p>
    </div>
  );
}

/** Mensagem de confirmação após uma ação (substitui os "p" verdes soltos). */
export function Notice({ tone = "success", children }: { tone?: "success" | "warning" | "danger" | "info"; children: React.ReactNode }) {
  const cls = { success: "notice-success", warning: "notice-warning", danger: "notice-danger", info: "notice-info" }[tone];
  const icon = { success: "check", warning: "alert", danger: "alert", info: "info" }[tone];
  return (
    <div role="status" className={`notice ${cls}`}>
      <Icon name={icon} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Cartão de tabela: cabeçalho com título e a tabela rolando na horizontal em telas pequenas. */
export function TableCard({ title, meta, children, className = "" }: { title: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-0 md:p-0 ${className}`}>
      <div className="px-5 pt-5 md:px-6">
        <CardHeader title={title}>{meta}</CardHeader>
      </div>
      <div className="overflow-x-auto px-2 pb-3 md:px-3">{children}</div>
    </section>
  );
}

/** Barra de filtros por segmento (links), com o ativo marcado por aria-current. */
export function FilterBar({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <nav aria-label={label} className="mb-4 flex flex-wrap gap-2">
      {children}
    </nav>
  );
}
