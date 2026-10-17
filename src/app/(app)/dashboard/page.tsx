import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl, dt } from "@/lib/format";
import { debtStatus } from "@/lib/collection";
import { PageTitle, Stat, Empty } from "@/components/ui";
import { AreaTrend, Bars, CHART, StackBar } from "@/components/charts";
import { DueBadge, RiskBadge } from "../pld/badges";

const WEEKS = 8;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const compact = (v: number) => (v === 0 ? "R$ 0" : v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : brl(v));

// Soma pagamentos por semana (últimas WEEKS semanas, a mais recente por último)
function weekly(payments: { amount: unknown; paidAt: Date }[]) {
  const now = Date.now();
  const WEEK = 7 * 86_400_000;
  const buckets = Array.from({ length: WEEKS }, (_, i) => {
    const end = new Date(now - (WEEKS - 1 - i) * WEEK);
    return { label: end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", ""), value: 0 };
  });
  for (const p of payments) {
    const age = Math.floor((now - p.paidAt.getTime()) / WEEK);
    if (age >= 0 && age < WEEKS) buckets[WEEKS - 1 - age].value += Number(p.amount);
  }
  return buckets;
}

export default async function Dashboard() {
  const s = await requireSession();
  const where = { orgId: s.orgId };
  const [recs, credits, recAgg, decisions, payments, debts, pldOpen, pldByRisk, recent] = await Promise.all([
    db.reconciliation.count({ where }),
    db.creditAnalysis.count({ where }),
    db.reconciliation.aggregate({ where, _sum: { totalReceived: true, divergent: true, missing: true } }),
    db.creditAnalysis.groupBy({ by: ["decision"], where, _count: true }),
    db.payment.findMany({ where: { agreement: { debt: where } }, select: { amount: true, paidAt: true } }),
    db.debt.groupBy({ by: ["status"], where, _count: true, _sum: { principal: true } }),
    db.pldCase.findMany({ where: { ...where, status: "EM_ANALISE" }, orderBy: { dueAt: "asc" }, take: 4 }),
    db.pldCase.groupBy({ by: ["risk"], where: { ...where, status: "EM_ANALISE" }, _count: true }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 7, include: { user: true } }),
  ]);

  const dec = Object.fromEntries(decisions.map((d) => [d.decision, d._count]));
  const risk = Object.fromEntries(pldByRisk.map((r) => [r.risk, r._count]));
  const series = weekly(payments);
  const recovered = payments.reduce((a, p) => a + Number(p.amount), 0);
  const openDebt = debts.filter((d) => d.status !== "QUITADO").reduce((a, d) => a + Number(d._sum.principal ?? 0), 0);
  const settledDebt = Number(debts.find((d) => d.status === "QUITADO")?._sum.principal ?? 0);
  const pldTotal = pldByRisk.reduce((a, r) => a + r._count, 0);
  const mandatory = await db.pldCase.count({ where: { ...where, status: "EM_ANALISE", mandatory: true } });
  const problems = (recAgg._sum.divergent ?? 0) + (recAgg._sum.missing ?? 0);
  const decTotal = (dec.APROVAR ?? 0) + (dec.ANALISAR ?? 0) + (dec.RECUSAR ?? 0);

  return (
    <>
      <PageTitle title={`Olá, ${s.name.split(" ")[0]}`} subtitle="O que a operação recuperou, o que precisa de atenção e o que vence primeiro" />

      <section className="rise relative overflow-hidden rounded-3xl bg-ink-900 p-6 text-white md:p-8">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="relative grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="text-xs font-medium uppercase tracking-widest text-gold-300">Recuperado em cobrança</p>
            <p className="font-display mt-2 text-5xl font-semibold tracking-tight tabular-nums md:text-6xl">{brl(Math.round(recovered)).replace(/,00$/, "")}</p>
            <p className="mt-3 max-w-sm text-sm text-brand-100/80">
              {recovered > 0
                ? `Pagamentos de acordos nas últimas ${WEEKS} semanas, via Pix e baixa manual.`
                : "Importe a carteira e envie as propostas: cada acordo pago aparece aqui."}
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 text-sm">
              <div>
                <dt className="text-brand-100/70">Carteira em aberto</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">{compact(openDebt)}</dd>
              </div>
              <div>
                <dt className="text-brand-100/70">Quitado</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">{compact(settledDebt)}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-2xl bg-white p-4 text-slate-900 lg:col-span-3">
            <div className="mb-1 flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold">Recuperação por semana</h2>
              <Link href="/cobranca" className="text-xs text-brand-600 hover:underline">
                Ver cobrança →
              </Link>
            </div>
            {recovered > 0 ? (
              <AreaTrend data={series} format={compact} label="Valor recuperado por semana" />
            ) : (
              <Empty>Ainda sem pagamentos de acordos.</Empty>
            )}
          </div>
        </div>
      </section>

      <div className="rise mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4" style={{ animationDelay: "80ms" }}>
        <Stat label="Valor conciliado" value={compact(Number(recAgg._sum.totalReceived ?? 0))} href="/conciliacao" tone="green" hint={plural(recs, "conciliação feita", "conciliações feitas")} />
        <Stat
          label="Itens a resolver"
          value={problems}
          href="/conciliacao"
          tone={problems ? "amber" : "slate"}
          hint="Divergências e títulos não pagos"
        />
        <Stat
          label="Casos de PLD abertos"
          value={pldTotal}
          href="/pld"
          tone={mandatory ? "red" : "slate"}
          hint={mandatory ? `${mandatory} com comunicação obrigatória` : "Nenhum com comunicação obrigatória"}
        />
        <Stat label="Análises de crédito" value={credits} href="/credito" tone="blue" hint={plural(dec.APROVAR ?? 0, "sugerida para aprovar", "sugeridas para aprovar")} />
      </div>

      <div className="rise mt-6 grid gap-4 lg:grid-cols-2" style={{ animationDelay: "160ms" }}>
        <div className="card">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-semibold">Prazos de PLD mais próximos</h2>
            <Link href="/pld" className="text-xs text-brand-600 hover:underline">
              Ver todos →
            </Link>
          </div>
          {pldOpen.length ? (
            <ul className="divide-y divide-slate-100">
              {pldOpen.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/pld/${c.id}`} className="min-w-0 truncate font-medium text-slate-800 hover:text-brand-600">
                    {c.clientName}
                    {c.mandatory && <span className="ml-2 badge bg-red-600 text-white">COE</span>}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <RiskBadge risk={c.risk} score={c.score} />
                    <DueBadge dueAt={c.dueAt} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhum caso em análise. Importe um lote de transações em PLD / COAF.</Empty>
          )}
          {pldTotal > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <StackBar
                parts={[
                  { label: "Alto", value: risk.ALTO ?? 0, color: CHART.c4 },
                  { label: "Médio", value: risk.MEDIO ?? 0, color: CHART.c2 },
                  { label: "Baixo", value: risk.BAIXO ?? 0, color: CHART.c1 },
                ]}
              />
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-semibold">Carteira de cobrança</h2>
            <Link href="/cobranca" className="text-xs text-brand-600 hover:underline">
              Abrir →
            </Link>
          </div>
          {debts.length ? (
            <Bars
              rows={["EM_ABERTO", "NEGOCIANDO", "ACORDO", "QUITADO"].map((k) => {
                const d = debts.find((x) => x.status === k);
                return { label: debtStatus[k]?.[0] ?? k, value: Number(d?._sum.principal ?? 0), hint: plural(d?._count ?? 0, "contrato", "contratos") };
              })}
              format={compact}
            />
          ) : (
            <Empty>Nenhuma dívida importada.</Empty>
          )}
          {decTotal > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="mb-3 text-sm font-semibold">Decisões sugeridas no crédito</h3>
              <StackBar
                parts={[
                  { label: "Aprovar", value: dec.APROVAR ?? 0, color: CHART.c1 },
                  { label: "Análise humana", value: dec.ANALISAR ?? 0, color: CHART.c2 },
                  { label: "Recusar", value: dec.RECUSAR ?? 0, color: CHART.c4 },
                ]}
              />
            </div>
          )}
        </div>
      </div>

      <div className="card rise mt-6" style={{ animationDelay: "240ms" }}>
        <h2 className="mb-3 font-semibold">Atividade recente</h2>
        {recent.length ? (
          <ul className="space-y-2 text-sm">
            {recent.map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span className="min-w-0">
                  <b>{a.user?.name ?? "Sistema"}</b> · {a.action}
                  {a.detail && <span className="text-slate-500"> — {a.detail}</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{dt(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Sem atividade.</Empty>
        )}
      </div>
    </>
  );
}
