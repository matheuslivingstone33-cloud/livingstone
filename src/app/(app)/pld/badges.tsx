export const PLD_STATUS: Record<string, [string, string]> = {
  EM_ANALISE: ["Em análise", "bg-amber-50 text-amber-800"],
  COMUNICADO: ["Comunicado ao COAF", "bg-indigo-50 text-indigo-800"],
  ARQUIVADO: ["Arquivado", "bg-slate-100 text-slate-600"],
};

const riskTone: Record<string, string> = {
  ALTO: "bg-red-50 text-red-800",
  MEDIO: "bg-amber-50 text-amber-800",
  BAIXO: "bg-slate-100 text-slate-700",
};

const riskDot: Record<string, string> = {
  ALTO: "bg-red-500",
  MEDIO: "bg-amber-500",
  BAIXO: "bg-slate-400",
};

export function RiskBadge({ risk, score }: { risk: string; score: number }) {
  return (
    <span className={`badge ${riskTone[risk] ?? "bg-slate-100 text-slate-700"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${riskDot[risk] ?? "bg-slate-400"}`} aria-hidden="true" />
      {risk === "MEDIO" ? "Médio" : risk === "ALTO" ? "Alto" : "Baixo"} <span className="tabular-nums opacity-70">· {score}</span>
    </span>
  );
}

export function DueBadge({ dueAt }: { dueAt: Date }) {
  const days = Math.ceil((dueAt.getTime() - Date.now()) / 86_400_000);
  const tone = days < 0 ? "bg-red-700 text-white" : days <= 7 ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-700";
  return <span className={`badge tabular-nums ${tone}`}>{days < 0 ? `Vencido há ${-days}d` : `${days} dias`}</span>;
}
