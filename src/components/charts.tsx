// Gráficos em SVG/HTML puro (renderizados no servidor, sem biblioteca).
// Regras: uma só escala, marcas finas, grade discreta, texto em tinta neutra (nunca na cor da série),
// legenda sempre visível e dica ao passar o mouse em cada ponto/barra.

export const CHART = { c1: "#0d9488", c2: "#b45309", c3: "#4338ca", c4: "#be185d", grid: "#e2e8f0", ink: "#475569" };

type Point = { label: string; value: number };

export function Sparkline({ values, color = CHART.c1, width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / span) * (height - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="draw" />
      <circle cx={lx} cy={ly} r="3" fill={color} stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

/** Linha com área suave: evolução no tempo de uma única medida. */
export function AreaTrend({
  data,
  format = (v) => String(v),
  color = CHART.c1,
  label,
  height = 220,
}: {
  data: Point[];
  format?: (v: number) => string;
  color?: string;
  label: string;
  height?: number;
}) {
  const W = 640;
  const H = height;
  const pad = { l: 56, r: 12, t: 12, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = Math.max(...data.map((d) => d.value), 1);
  const top = niceCeil(max);
  const x = (i: number) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)} ${pad.t + ih} L${x(0).toFixed(1)} ${pad.t + ih} Z`;
  const ticks = [0, 0.5, 1].map((f) => f * top);
  const gid = `g${label.replace(/\W/g, "")}`;
  const slot = iw / Math.max(data.length - 1, 1);
  // Rótulos do eixo X: primeiro, último e alguns no meio, sem encostar no último
  const step = Math.ceil(data.length / 5);
  const showLabel = (i: number) => i === 0 || i === data.length - 1 || (i % step === 0 && data.length - 1 - i >= step);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth="1" />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={CHART.ink}>
            {format(t)}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="draw" />
      {data.map((d, i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize="11" fill={CHART.ink}>
          {showLabel(i) ? d.label : ""}
        </text>
      ))}
      {data.map((d, i) => (
        <g key={`h${i}`} className="group">
          <rect x={x(i) - slot / 2} y={pad.t} width={Math.max(slot, 12)} height={ih} fill="transparent">
            <title>{`${d.label}: ${format(d.value)}`}</title>
          </rect>
          <line x1={x(i)} x2={x(i)} y1={pad.t} y2={pad.t + ih} stroke={CHART.ink} strokeOpacity="0.35" strokeDasharray="3 3" className="opacity-0 group-hover:opacity-100" pointerEvents="none" />
          <circle cx={x(i)} cy={y(d.value)} r={i === data.length - 1 ? 4.5 : 0} fill={color} stroke="#fff" strokeWidth="2" className="group-hover:[r:4.5px]" pointerEvents="none" />
        </g>
      ))}
    </svg>
  );
}

/** Ranking horizontal: uma barra por categoria, valor ao lado (rótulo direto, sem legenda). */
export function Bars({
  rows,
  format = (v) => String(v),
  color = CHART.c1,
}: {
  rows: { label: string; value: number; hint?: string }[];
  format?: (v: number) => string;
  color?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}${r.hint ? ` · ${r.hint}` : ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-700">{r.label}</span>
            <span className="font-medium tabular-nums text-slate-900">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-r-full rounded-l-sm" style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Barra empilhada de proporção (partes de um todo) com legenda e valores. */
export function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return null;
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.label} title={`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
          ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label} <b className="tabular-nums text-slate-900">{p.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
