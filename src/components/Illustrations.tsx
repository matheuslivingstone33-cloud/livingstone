// Ilustrações conceituais em SVG (sem números nem dados inventados).
// Mostram o que a plataforma faz: arquivos entram, são cruzados por regras auditáveis e saem classificados,
// com cada ação gravada numa corrente de registros encadeados.

type FlowLabels = { inputs: string[]; outputs: { label: string; color: string }[]; core: string; chain: string };

export function FlowIllustration({ labels }: { labels: FlowLabels }) {
  const inY = labels.inputs.map((_, i) => 40 + i * 56);
  const outY = labels.outputs.map((_, i) => 68 + i * 56);
  const cx = 250;
  const cy = 152;
  return (
    <svg viewBox="0 0 500 360" className="h-auto w-full" aria-hidden="true">
      <defs>
        <radialGradient id="core-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#14a08a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#14a08a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Entradas */}
      {labels.inputs.map((t, i) => (
        <g key={t}>
          <path
            d={`M118 ${inY[i]} C 180 ${inY[i]}, 190 ${cy}, ${cx - 46} ${cy}`}
            fill="none"
            stroke="#a8e5d4"
            strokeOpacity="0.35"
            strokeWidth="1.2"
            pathLength={1}
            className="draw"
          />
          <rect x="8" y={inY[i] - 15} width="110" height="30" rx="8" fill="#11313b" stroke="#ffffff" strokeOpacity="0.1" />
          <path d={`M22 ${inY[i] - 6}h7l3 3v9h-10z`} fill="none" stroke="#a8e5d4" strokeOpacity="0.7" strokeWidth="1.2" strokeLinejoin="round" />
          <text x="40" y={inY[i] + 4.5} fontSize="12.5" fill="#d3f3ea" fontFamily="var(--font-geist-mono), monospace">
            {t}
          </text>
        </g>
      ))}

      {/* Núcleo: bússola da marca */}
      <circle cx={cx} cy={cy} r="96" fill="url(#core-glow)" />
      <circle cx={cx} cy={cy} r="66" fill="none" stroke="#ecd48a" strokeOpacity="0.18" strokeDasharray="2 5" />
      <circle cx={cx} cy={cy} r="46" fill="#0b5c56" stroke="#ecd48a" strokeOpacity="0.5" strokeWidth="1.2" />
      <path d={`M${cx} ${cy - 30} L${cx + 10} ${cy} L${cx} ${cy + 30} L${cx - 10} ${cy} Z`} fill="#e0b84a" />
      <path d={`M${cx} ${cy - 30} L${cx + 10} ${cy} H${cx - 10} Z`} fill="#fff" fillOpacity="0.92" />
      <circle cx={cx} cy={cy} r="3" fill="#0a2a30" />
      <text x={cx} y={cy + 72} textAnchor="middle" fontSize="11" letterSpacing="1.6" fill="#ecd48a" fillOpacity="0.85">
        {labels.core.toUpperCase()}
      </text>

      {/* Saídas classificadas */}
      {labels.outputs.map((o, i) => (
        <g key={o.label}>
          <path
            d={`M${cx + 46} ${cy} C 330 ${cy}, 320 ${outY[i]}, 372 ${outY[i]}`}
            fill="none"
            stroke={o.color}
            strokeOpacity="0.6"
            strokeWidth="1.4"
            pathLength={1}
            className="draw"
          />
          <rect x="372" y={outY[i] - 15} width="120" height="30" rx="15" fill="#ffffff" fillOpacity="0.96" />
          <circle cx="388" cy={outY[i]} r="4" fill={o.color} />
          <text x="400" y={outY[i] + 4.5} fontSize="12.5" fontWeight="500" fill="#0a1f2c">
            {o.label}
          </text>
        </g>
      ))}

      {/* Corrente de auditoria */}
      <g transform="translate(70 318)">
        {Array.from({ length: 6 }, (_, i) => (
          <g key={i}>
            {i > 0 && <path d={`M${i * 62 - 18} 12h18`} stroke="#ecd48a" strokeOpacity="0.5" strokeWidth="1.2" />}
            <rect x={i * 62} y="0" width="44" height="24" rx="6" fill="none" stroke="#ecd48a" strokeOpacity={i === 5 ? 0.9 : 0.4} />
            <path d={`M${i * 62 + 9} 9h20M${i * 62 + 9} 15h13`} stroke="#ecd48a" strokeOpacity={i === 5 ? 0.8 : 0.35} strokeWidth="1.4" strokeLinecap="round" />
          </g>
        ))}
      </g>
      <text x="250" y="306" textAnchor="middle" fontSize="11" letterSpacing="1.6" fill="#a8e5d4" fillOpacity="0.7">
        {labels.chain.toUpperCase()}
      </text>
    </svg>
  );
}

/** Corrente de registros encadeados: cada bloco aponta para o anterior. */
export function ChainIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 64" className={`h-auto w-full ${className}`} aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => {
        const x = 4 + i * 64;
        const last = i === 4;
        return (
          <g key={i}>
            {i > 0 && <path d={`M${x - 18} 32h18`} stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.4" strokeDasharray="3 3" />}
            <rect x={x} y="14" width="46" height="36" rx="8" fill={last ? "currentColor" : "none"} fillOpacity={last ? 0.12 : 0} stroke="currentColor" strokeOpacity={last ? 0.9 : 0.4} strokeWidth="1.2" />
            <path d={`M${x + 10} 26h26M${x + 10} 32h18M${x + 10} 38h22`} stroke="currentColor" strokeOpacity={last ? 0.85 : 0.35} strokeWidth="1.4" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}
