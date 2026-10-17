export const PLD_STATUS: Record<string, [string, string]> = {
  EM_ANALISE: ["Em análise", "bg-amber-100 text-amber-800"],
  COMUNICADO: ["Comunicado ao COAF", "bg-blue-100 text-blue-800"],
  ARQUIVADO: ["Arquivado", "bg-slate-100 text-slate-600"],
};

const riskTone: Record<string, string> = {
  ALTO: "bg-red-100 text-red-800",
  MEDIO: "bg-amber-100 text-amber-800",
  BAIXO: "bg-slate-100 text-slate-700",
};

export function RiskBadge({ risk, score }: { risk: string; score: number }) {
  return (
    <span className={`badge ${riskTone[risk]}`}>
      {risk === "MEDIO" ? "Médio" : risk === "ALTO" ? "Alto" : "Baixo"} · {score}
    </span>
  );
}

export function DueBadge({ dueAt }: { dueAt: Date }) {
  const days = Math.ceil((dueAt.getTime() - Date.now()) / 86_400_000);
  const tone = days < 0 ? "bg-red-600 text-white" : days <= 7 ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700";
  return <span className={`badge ${tone}`}>{days < 0 ? `Vencido há ${-days}d` : `${days} dias`}</span>;
}
