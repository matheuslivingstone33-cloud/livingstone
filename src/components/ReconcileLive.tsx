// Mockup ilustrativo da conciliação para o hero da landing. Só apresentação:
// recebe textos e linhas prontos, não calcula nada. A animação (classes live-*)
// existe só sem prefers-reduced-motion; com ela, mostra direto o estado final.

export type LiveRow = {
  ref: string;
  expected: string;
  received: string;
  status: number; // índice em labels.statuses / colors
  rule: string;
  note?: string;
  mark?: "tol" | "excess";
};

// Colunas fixas para que todas as linhas fiquem alinhadas entre si.
const COLS = "grid-cols-[minmax(0,1fr)_5.75rem_6rem_7.25rem]";
// No celular some a coluna "Esperado" e só ficam as notas que contam a história.
const COLS_COMPACT = "grid-cols-[minmax(0,1fr)_5.75rem_6.75rem]";

type Labels = {
  title: string;
  sample: string;
  tol: string;
  cols: readonly string[];
  statuses: readonly string[];
  matched: string;
  excess: string;
  aria: string;
};

export function ReconcileLive({
  labels,
  rows,
  colors,
  excessValue,
  compact = false,
}: {
  labels: Labels;
  rows: readonly LiveRow[];
  colors: readonly string[];
  excessValue: string;
  compact?: boolean;
}) {
  const cols = compact ? COLS_COMPACT : COLS;
  const matched = rows.filter((r) => r.status === 0).length;
  const end = 0.35 + rows.length * 0.22 + 0.5;

  return (
    <div role="img" aria-label={labels.aria} className="min-w-0">
      <div aria-hidden="true">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow flex items-center gap-3 text-brand-100/70">
            <span className="rule-gold" />
            {labels.title}
          </p>
          <span className="live-pulse rounded-full border border-gold-400/40 px-2.5 py-1 font-mono text-[11px] text-gold-300" style={{ animationDelay: `${0.35 + 1 * 0.22 + 0.3}s` }}>
            {labels.tol}
          </span>
        </div>

        <div className={`mt-5 grid ${cols} gap-x-4 border-b border-white/10 pb-2 text-[11px] uppercase tracking-wider text-brand-100/50`}>
          <span>{labels.cols[0]}</span>
          {!compact && <span className="text-right">{labels.cols[1]}</span>}
          <span className="text-right">{labels.cols[2]}</span>
          <span>{labels.cols[3]}</span>
        </div>

        <ul className="divide-y divide-white/[0.06]">
          {rows.map((r, i) => {
            const delay = 0.35 + i * 0.22;
            const color = colors[r.status];
            return (
              <li key={r.ref} className="live-row py-2.5" style={{ animationDelay: `${delay}s` }}>
                <div className={`grid ${cols} items-center gap-x-4 font-mono text-xs tabular-nums`}>
                  <span className="min-w-0">
                    <span className="block truncate text-brand-100/85">{r.ref}</span>
                    <span className="block truncate font-sans text-[11px] text-brand-100/45">{r.rule}</span>
                  </span>
                  {!compact && <span className="text-right text-brand-100/55">{r.expected}</span>}
                  <span className="text-right text-white">{r.received}</span>
                  <span
                    className="live-badge inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 font-sans text-[11px] font-medium"
                    style={{ color, backgroundColor: `${color}1f`, animationDelay: `${delay + 0.3}s` }}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
                    {labels.statuses[r.status]}
                  </span>
                </div>
                {r.note && (!compact || r.mark) && (
                  <p
                    className={`live-badge mt-1 font-sans text-[11px] ${r.mark ? "text-gold-300" : "text-brand-100/50"}`}
                    style={{ animationDelay: `${delay + 0.4}s` }}
                  >
                    {r.note}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="text-brand-100/70">
              <span className="font-mono text-base text-brand-400 tabular-nums">{matched}</span>
              <span className="font-mono text-brand-100/50"> / {rows.length}</span> {labels.matched}
            </span>
            <span className="live-pulse text-gold-300" style={{ animationDelay: `${end}s` }}>
              {labels.excess}: <span className="font-mono tabular-nums">{excessValue}</span>
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="live-bar h-full rounded-full bg-brand-400" style={{ width: `${(matched / rows.length) * 100}%`, animationDelay: `${end - 0.4}s` }} />
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-wider text-brand-100/35">{labels.sample}</p>
        </div>
      </div>
    </div>
  );
}
