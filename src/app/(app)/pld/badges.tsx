import { Badge, type BadgeTone } from "@/components/ui";

const riskTone: Record<string, BadgeTone> = { ALTO: "danger", MEDIO: "warning", BAIXO: "neutral" };

export function RiskBadge({ risk, score }: { risk: string; score: number }) {
  return (
    <Badge tone={riskTone[risk] ?? "neutral"}>
      {risk === "MEDIO" ? "Médio" : risk === "ALTO" ? "Alto" : "Baixo"} <span className="tabular-nums opacity-70">· {score}</span>
    </Badge>
  );
}

export function DueBadge({ dueAt }: { dueAt: Date }) {
  const days = Math.ceil((dueAt.getTime() - Date.now()) / 86_400_000);
  const tone: BadgeTone = days < 0 ? "critical" : days <= 7 ? "danger" : "neutral";
  return <Badge tone={tone} dot={false} className="tabular-nums">{days < 0 ? `Vencido há ${-days}d` : `${days} dias`}</Badge>;
}
