import Link from "next/link";
import { Sparkline } from "@/components/charts";

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
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
    slate: "text-slate-900",
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-700",
    blue: "text-brand-700",
  };
  const body = (
    <div className={`card h-full transition ${href ? "hover:border-brand-200 hover:shadow-md" : ""}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className={`text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
        {trend && <Sparkline values={trend} />}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const statusTone: Record<string, string> = {
  CONCILIADO: "bg-emerald-100 text-emerald-800",
  APROVAR: "bg-emerald-100 text-emerald-800",
  DIVERGENTE: "bg-amber-100 text-amber-800",
  ANALISAR: "bg-amber-100 text-amber-800",
  PENDENTE: "bg-red-100 text-red-800",
  RECUSAR: "bg-red-100 text-red-800",
  NAO_ESPERADO: "bg-violet-100 text-violet-800",
};
const statusLabel: Record<string, string> = {
  CONCILIADO: "Conciliado",
  DIVERGENTE: "Divergente",
  PENDENTE: "Não pago",
  NAO_ESPERADO: "Não esperado",
  APROVAR: "Aprovar",
  ANALISAR: "Análise humana",
  RECUSAR: "Recusar",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusTone[status] ?? "bg-slate-100 text-slate-700"}`}>{statusLabel[status] ?? status}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-slate-500">{children}</p>;
}

export function DemoFiles({ files }: { files: { href: string; label: string }[] }) {
  return (
    <p className="text-xs text-slate-500">
      Arquivos de exemplo:{" "}
      {files.map((f, i) => (
        <span key={f.href}>
          {i > 0 && " · "}
          <a className="text-brand-600 underline" href={f.href} download>
            {f.label}
          </a>
        </span>
      ))}
    </p>
  );
}
