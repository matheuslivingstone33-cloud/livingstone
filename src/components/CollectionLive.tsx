// Mockup ilustrativo da cobrança para o hero da landing. Só apresentação: os valores
// chegam prontos (calculados pela página com src/lib/collection.ts). As classes live-*
// animam uma vez e, com prefers-reduced-motion, a tela já aparece no estado final.

export type CollectionLiveData = {
  debtor: string;
  contract: string;
  days: number;
  band: string;
  principal: string;
  multa: string;
  juros: string;
  total: string;
  options: { label: string; total: string; detail: string; best?: boolean }[];
  paid: string;
};

type Labels = {
  title: string;
  sample: string;
  overdue: string;
  principal: string;
  multa: string;
  juros: string;
  updated: string;
  offers: string;
  sent: string;
  paid: string;
  once: string;
  aria: string;
};

const step = (i: number) => `${0.3 + i * 0.45}s`;

export function CollectionLive({ labels, data, compact = false }: { labels: Labels; data: CollectionLiveData; compact?: boolean }) {
  const options = compact ? data.options.slice(0, 2) : data.options;

  return (
    <div role="img" aria-label={labels.aria} className="min-w-0">
      <div aria-hidden="true">
        <p className="eyebrow flex items-center gap-3 text-brand-100/70">
          <span className="rule-gold" />
          {labels.title}
        </p>

        <div className="live-row mt-5 flex flex-wrap items-baseline justify-between gap-2" style={{ animationDelay: step(0) }}>
          <div className="min-w-0">
            <p className="truncate font-display text-lg text-white">{data.debtor}</p>
            <p className="font-mono text-[11px] text-brand-100/50">{data.contract}</p>
          </div>
          <span className="rounded-full bg-[#f87171]/15 px-2.5 py-1 text-[11px] font-medium text-[#f87171]">
            {data.days} {labels.overdue} · {data.band}
          </span>
        </div>

        <dl className="live-row mt-4 space-y-1.5 border-y border-white/10 py-3 font-mono text-xs tabular-nums" style={{ animationDelay: step(1) }}>
          {[
            [labels.principal, data.principal],
            [labels.multa, data.multa],
            [labels.juros, data.juros],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="font-sans text-brand-100/55">{k}</dt>
              <dd className="text-brand-100/85">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 pt-1.5 text-sm">
            <dt className="font-sans text-brand-100/80">{labels.updated}</dt>
            <dd className="text-white">{data.total}</dd>
          </div>
        </dl>

        <p className="live-row mt-4 text-[11px] uppercase tracking-wider text-brand-100/50" style={{ animationDelay: step(2) }}>
          {labels.offers}
        </p>
        <ul className={`mt-2 grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-3"}`}>
          {options.map((o, i) => (
            <li
              key={o.label}
              className={`live-badge rounded-xl border px-3 py-2.5 ${o.best ? "border-gold-400/50 bg-gold-400/[0.07]" : "border-white/10 bg-white/[0.03]"}`}
              style={{ animationDelay: `${0.3 + 2 * 0.45 + 0.15 * (i + 1)}s` }}
            >
              <p className={`text-[11px] font-medium ${o.best ? "text-gold-300" : "text-brand-100/70"}`}>{o.label}</p>
              <p className="mt-0.5 font-mono text-sm text-white tabular-nums">{o.total}</p>
              <p className="font-sans text-[10px] text-brand-100/50">{o.detail}</p>
            </li>
          ))}
        </ul>

        <div className="live-row mt-4 flex items-center gap-2 text-xs text-brand-100/70" style={{ animationDelay: step(4) }}>
          <span className="size-1.5 rounded-full bg-brand-400" />
          {labels.sent}
        </div>

        <div className="live-pulse mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-400/30 bg-brand-400/10 px-3 py-2.5" style={{ animationDelay: step(5) }}>
          <span className="flex items-center gap-2 text-sm font-medium text-brand-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {labels.paid} <span className="font-mono tabular-nums">{data.paid}</span>
          </span>
          <span className="text-[11px] text-gold-300">{labels.once}</span>
        </div>

        <p className="mt-3 text-[10px] uppercase tracking-wider text-brand-100/35">{labels.sample}</p>
      </div>
    </div>
  );
}
