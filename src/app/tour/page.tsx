// Tour público: mostra os módulos funcionando sobre arquivos fictícios (public/demo), sem login e sem gravar nada.
// Observação: não usa `dynamic = "force-static"` porque o idioma vem de ?lang=en (searchParams), como na landing;
// com force-static o searchParams chegaria vazio e a versão em inglês nunca apareceria.
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { Notice, Stat, StatusBadge, TableCard } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { brl, day } from "@/lib/format";
import { buildTourData } from "@/lib/tour";
import { TOUR_CREDIT, TOUR_LEGACY } from "@/lib/tour-static";

export const metadata: Metadata = {
  title: `Tour — ${BRAND.name}`,
  description: "Veja a conciliação, a cobrança, o PLD, o crédito e o legado funcionando com números ilustrativos.",
};

type Lang = "pt" | "en";

const T = {
  pt: {
    eyebrow: "Tour do produto",
    h1: "Veja a Livingstone trabalhando",
    sub: "Cada número abaixo foi calculado pelas mesmas regras do sistema, lendo arquivos fictícios. Nada aqui é gravado.",
    notice: "Números ilustrativos, calculados a partir de arquivos fictícios.",
    nav: { conciliacao: "Conciliação", cobranca: "Cobrança", pld: "PLD", credito: "Crédito", legado: "Legado" },
    back: "Voltar",
    login: "Entrar",
    talk: "Falar com a gente",
    subject: "Quero conhecer a Livingstone",
    ref: "Data de referência",
    conc: {
      title: "Conciliação bancária",
      text: "Títulos esperados contra o retorno CNAB 400 do banco. Casamento por referência e, sem referência, por valor e data (±3 dias), com tolerância de 2 centavos.",
      expected: "Títulos esperados",
      received: "Recebido no arquivo",
      matched: "Conciliados",
      attention: "Precisam de atenção",
      table: "Itens conciliados",
      cols: ["Referência", "Pagador", "Esperado", "Recebido", "Situação", "Observação"],
    },
    cob: {
      title: "Cobrança e acordos",
      text: "A carteira é atualizada com multa limitada a 2% (CDC) e juros pro rata dia. As opções de acordo saem das faixas de atraso configuradas, sem descer do piso sobre o valor original.",
      principal: "Valor original",
      updated: "Valor atualizado",
      debts: "Contratos",
      table: "Carteira atualizada",
      cols: ["Devedor", "Produto", "Vencimento", "Atraso", "Atualizado", "Faixa", "Melhor à vista", "Opções"],
      days: "dias",
    },
    pld: {
      title: "Prevenção à lavagem de dinheiro (PLD)",
      text: "Regras baseadas na Circular BCB 3.978/2020 aplicadas às transações de cada cliente. O sistema aponta os alertas e a pontuação; a decisão de comunicar ao COAF é do analista.",
      txs: "Transações lidas",
      clients: "Clientes",
      alerts: "Alertas gerados",
      table: "Clientes por pontuação de risco",
      cols: ["Cliente", "Transações", "Pontuação", "Risco", "Alertas"],
      none: "Sem alertas",
      risk: { ALTO: "Alto", MEDIO: "Médio", BAIXO: "Baixo" } as Record<string, string>,
    },
    cred: {
      title: "Análise de crédito",
      text: "Holerite e extrato são lidos para estimar renda, despesas e comprometimento. A sugestão segue regras de score e limite de comprometimento (35%); a decisão final é do analista.",
      requested: "Solicitado",
      income: "Renda considerada",
      installment: "Parcela estimada",
      commitment: "Comprometimento",
      score: "Score",
      flags: "Pontos de atenção",
      noFlags: "Nenhum ponto de atenção identificado.",
      files: "Arquivos",
      snapshot: "Resultado das regras locais (sem IA) para estes arquivos.",
    },
    leg: {
      title: "Modernização de legado",
      text: "Um programa COBOL é lido, as regras de negócio são listadas e uma tradução estrutural para TypeScript é gerada para revisão humana.",
      lines: "Linhas úteis",
      rules: "Regras encontradas",
      where: "Onde",
      rule: "Regra",
      code: "Trecho do código gerado",
      snapshot: "Resultado das regras locais (sem IA). Com a IA ativa, a conversão fica mais completa.",
    },
    trail: "Cada ação no sistema real entra numa trilha de auditoria encadeada por hash, que evidencia alterações.",
    ctaTitle: "Quer ver com os seus arquivos?",
    ctaText: "A gente mostra a Livingstone rodando com a sua operação.",
  },
  en: {
    eyebrow: "Product tour",
    h1: "See Livingstone at work",
    sub: "Every number below was computed by the same rules the system uses, reading fictitious files. Nothing here is saved.",
    notice: "Illustrative figures computed from fictitious files.",
    nav: { conciliacao: "Reconciliation", cobranca: "Collections", pld: "AML", credito: "Credit", legado: "Legacy" },
    back: "Back",
    login: "Sign in",
    talk: "Talk to us",
    subject: "I want to know Livingstone",
    ref: "Reference date",
    conc: {
      title: "Bank reconciliation",
      text: "Expected receivables against the bank's CNAB 400 return file. Matching by reference and, without one, by amount and date (±3 days), with a 2-cent tolerance.",
      expected: "Expected items",
      received: "Received in file",
      matched: "Reconciled",
      attention: "Need attention",
      table: "Reconciled items",
      cols: ["Reference", "Payer", "Expected", "Received", "Status", "Note"],
    },
    cob: {
      title: "Collections and settlements",
      text: "The portfolio is updated with a late fee capped at 2% (Brazilian consumer code) and daily pro rata interest. Settlement options come from the configured delinquency bands, never below the floor on the original amount.",
      principal: "Original amount",
      updated: "Updated amount",
      debts: "Contracts",
      table: "Updated portfolio",
      cols: ["Debtor", "Product", "Due date", "Days late", "Updated", "Band", "Best lump sum", "Options"],
      days: "days",
    },
    pld: {
      title: "Anti-money laundering (AML)",
      text: "Rules based on Central Bank Circular 3,978/2020 applied to each client's transactions. The system flags alerts and a score; the decision to report to COAF belongs to the analyst. Alert names are shown in Portuguese.",
      txs: "Transactions read",
      clients: "Clients",
      alerts: "Alerts raised",
      table: "Clients by risk score",
      cols: ["Client", "Transactions", "Score", "Risk", "Alerts"],
      none: "No alerts",
      risk: { ALTO: "High", MEDIO: "Medium", BAIXO: "Low" } as Record<string, string>,
    },
    cred: {
      title: "Credit analysis",
      text: "Payslip and bank statement are read to estimate income, expenses and commitment. The suggestion follows score and commitment-limit (35%) rules; the final decision belongs to the analyst. Findings are shown in Portuguese.",
      requested: "Requested",
      income: "Income considered",
      installment: "Estimated installment",
      commitment: "Commitment",
      score: "Score",
      flags: "Points of attention",
      noFlags: "No points of attention found.",
      files: "Files",
      snapshot: "Local-rules result (no AI) for these files.",
    },
    leg: {
      title: "Legacy modernization",
      text: "A COBOL program is read, its business rules are listed and a structural TypeScript translation is generated for human review.",
      lines: "Lines of code",
      rules: "Rules found",
      where: "Where",
      rule: "Rule",
      code: "Generated code excerpt",
      snapshot: "Local-rules result (no AI). With AI enabled, the conversion is more complete.",
    },
    trail: "Every action in the real system goes into a hash-chained audit trail that makes changes evident.",
    ctaTitle: "Want to see it with your files?",
    ctaText: "We'll show Livingstone running with your operation.",
  },
};

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Section({ id, icon, title, text, children }: { id: string; icon: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line py-14 md:py-20">
      <div className="mb-8 max-w-3xl">
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700" aria-hidden="true">
          <Icon name={icon} size={22} />
        </span>
        <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-balance text-ink-900 md:text-4xl">{title}</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-pretty text-ink-500">{text}</p>
      </div>
      {children}
    </section>
  );
}

export default async function Tour({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: q } = await searchParams;
  const lang: Lang = q === "en" ? "en" : "pt";
  const t = T[lang];
  const data = buildTourData();
  const { conciliacao: c, cobranca: cob, pld } = data;
  const mailto = `mailto:${BRAND.contact}?subject=${encodeURIComponent(t.subject)}`;
  const anchors = Object.entries(t.nav) as [string, string][];

  return (
    <div className="min-h-screen bg-paper text-ink-900">
      <header className="on-ink surface-ink bg-ink-950 pb-10">
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href={lang === "en" ? "/?lang=en" : "/"} className="rounded-xl" aria-label={t.back}>
            <Logo size={32} />
          </Link>
          <nav className="flex items-center gap-3 text-sm text-brand-100" aria-label={lang === "pt" ? "Idioma e acesso" : "Language and access"}>
            <span className="flex items-center gap-0.5 rounded-full border border-white/15 p-0.5 text-xs">
              {(["pt", "en"] as const).map((l) => (
                <Link key={l} href={l === "pt" ? "/tour" : "/tour?lang=en"} aria-current={l === lang ? "true" : undefined} className={`rounded-full px-2.5 py-1 uppercase transition-colors ${l === lang ? "bg-white/15 text-white" : "hover:text-white"}`}>
                  {l}
                </Link>
              ))}
            </span>
            <Link href={lang === "en" ? "/?lang=en" : "/"} className="inline-flex items-center gap-1 hover:text-white">
              <Icon name="back" size={14} />
              {t.back}
            </Link>
            <Link href="/login" className="rounded-xl border border-white/20 px-4 py-2 font-medium text-white transition-colors hover:border-white/40 hover:bg-white/10">
              {t.login}
            </Link>
          </nav>
        </div>
        <div className="relative mx-auto max-w-6xl px-6 pt-6">
          <p className="eyebrow flex items-center gap-3 text-gold-300">
            <span className="rule-gold" aria-hidden="true" />
            {t.eyebrow}
          </p>
          <h1 className="font-display mt-4 text-4xl font-semibold leading-tight tracking-tight text-balance text-white md:text-5xl">{t.h1}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-100/85">{t.sub}</p>
          <div className="mt-6 max-w-2xl">
            <Notice tone="info">
              <strong>{t.notice}</strong> {t.ref}: {day(data.referenceDate)}.
            </Notice>
          </div>
          <nav aria-label={t.eyebrow} className="mt-6 flex flex-wrap gap-2">
            {anchors.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-brand-100 transition-colors hover:border-white/40 hover:text-white">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <Section id="conciliacao" icon="conciliacao" title={t.conc.title} text={t.conc.text}>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t.conc.expected} value={c.expectedCount} />
            <Stat label={t.conc.received} value={brl(c.received)} hint={`${c.format} · ${c.receivedCount} ${lang === "en" ? "entries" : "registros"}`} tone="blue" />
            <Stat label={t.conc.matched} value={c.summary.matched} tone="green" />
            <Stat label={t.conc.attention} value={c.summary.divergent + c.summary.missing + c.summary.unexpected} tone="amber" />
          </div>
          <TableCard title={t.conc.table} meta="retorno_cnab400.ret · titulos_esperados.csv">
            <table className="table">
              <thead>
                <tr>
                  {t.conc.cols.map((h, i) => (
                    <th key={h} className={i === 2 || i === 3 ? "num" : undefined}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.items.map((i, k) => (
                  <tr key={`${i.reference}-${k}`}>
                    <td className="font-mono text-xs">{i.reference}</td>
                    <td>{i.payer ?? "—"}</td>
                    <td className="num">{brl(i.expectedAmount)}</td>
                    <td className="num">{brl(i.receivedAmount)}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td className="text-xs text-ink-500">{i.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </Section>

        <Section id="cobranca" icon="cobranca" title={t.cob.title} text={t.cob.text}>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label={t.cob.debts} value={cob.debts.length} />
            <Stat label={t.cob.principal} value={brl(cob.totalPrincipal)} />
            <Stat label={t.cob.updated} value={brl(cob.totalUpdated)} tone="amber" />
          </div>
          <TableCard title={t.cob.table} meta="carteira_inadimplentes.csv">
            <table className="table">
              <thead>
                <tr>
                  {t.cob.cols.map((h, i) => (
                    <th key={h} className={i === 3 || i === 4 || i === 6 || i === 7 ? "num" : undefined}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cob.debts.map((d) => (
                  <tr key={d.contract}>
                    <td className="font-medium">{d.debtor}</td>
                    <td className="text-ink-500">{d.product ?? "—"}</td>
                    <td>{day(d.dueDate)}</td>
                    <td className="num">{d.days} {t.cob.days}</td>
                    <td className="num font-medium">{brl(d.total)}</td>
                    <td className="text-xs">{d.band}</td>
                    <td className="num text-emerald-700">{brl(d.options[0]?.total)}</td>
                    <td className="num">{d.options.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </Section>

        <Section id="pld" icon="pld" title={t.pld.title} text={t.pld.text}>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label={t.pld.txs} value={pld.txCount} />
            <Stat label={t.pld.clients} value={pld.clients.length} />
            <Stat label={t.pld.alerts} value={pld.alertCount} tone="red" />
          </div>
          <TableCard title={t.pld.table} meta="transacoes_pld.csv">
            <table className="table">
              <thead>
                <tr>
                  {t.pld.cols.map((h, i) => (
                    <th key={h} className={i === 1 || i === 2 ? "num" : undefined}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pld.clients.map((cl) => (
                  <tr key={cl.clientName}>
                    <td className="font-medium">{cl.clientName}</td>
                    <td className="num">{cl.txCount}</td>
                    <td className="num font-medium">{cl.score}</td>
                    <td>
                      <span className={`badge ${cl.risk === "ALTO" ? "bg-red-50 text-red-800" : cl.risk === "MEDIO" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{t.pld.risk[cl.risk] ?? cl.risk}</span>
                    </td>
                    <td className="text-xs text-ink-600">{cl.alerts.length ? cl.alerts.map((a) => a.title).join(" · ") : <span className="text-ink-500">{t.pld.none}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </Section>

        <Section id="credito" icon="credito" title={t.cred.title} text={t.cred.text}>
          <div className="grid gap-4 md:grid-cols-2">
            {TOUR_CREDIT.map((r) => (
              <article key={r.applicant} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-xl font-semibold text-ink-900">{r.applicant}</h3>
                  <StatusBadge status={r.decision} />
                </div>
                <p className="mt-1 text-xs text-ink-500">{t.cred.files}: {r.files.join(" · ")}</p>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div><dt className="eyebrow">{t.cred.requested}</dt><dd className="tabular-nums">{brl(r.requested)} · {r.months}x</dd></div>
                  <div><dt className="eyebrow">{t.cred.income}</dt><dd className="tabular-nums">{brl(r.income)}</dd></div>
                  <div><dt className="eyebrow">{t.cred.installment}</dt><dd className="tabular-nums">{brl(r.installment)}</dd></div>
                  <div><dt className="eyebrow">{t.cred.commitment}</dt><dd className="tabular-nums">{pct(r.commitment)}</dd></div>
                  <div><dt className="eyebrow">{t.cred.score}</dt><dd className="tabular-nums">{r.score}</dd></div>
                </dl>
                <h4 className="mt-5 text-sm font-semibold text-ink-800">{t.cred.flags}</h4>
                {r.flags.length ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {r.flags.map((f) => (
                      <li key={f.texto} className="flex gap-2">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${f.nivel === "alto" ? "bg-red-500" : f.nivel === "medio" ? "bg-amber-500" : "bg-slate-400"}`} aria-hidden="true" />
                        <span className="text-ink-600">{f.texto}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-ink-500">{t.cred.noFlags}</p>
                )}
              </article>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-500">{t.cred.snapshot}</p>
        </Section>

        <Section id="legado" icon="legado" title={t.leg.title} text={t.leg.text}>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label={lang === "en" ? "File" : "Arquivo"} value={<span className="font-mono text-base">{TOUR_LEGACY.file}</span>} hint={`${TOUR_LEGACY.language} → ${TOUR_LEGACY.target}`} />
            <Stat label={t.leg.lines} value={TOUR_LEGACY.linesOfCode} />
            <Stat label={t.leg.rules} value={TOUR_LEGACY.rules.length} tone="blue" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TableCard title={t.leg.rules}>
              <table className="table">
                <thead>
                  <tr><th>{t.leg.where}</th><th>{t.leg.rule}</th></tr>
                </thead>
                <tbody>
                  {TOUR_LEGACY.rules.map((r) => (
                    <tr key={r.regra}>
                      <td className="font-mono text-xs">{r.onde}</td>
                      <td className="font-mono text-xs">{r.regra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
            <section className="card min-w-0">
              <h3 className="card-title mb-3">{t.leg.code}</h3>
              <pre className="overflow-x-auto rounded-xl bg-ink-950 p-4 font-mono text-xs leading-relaxed text-brand-100">{TOUR_LEGACY.codeExcerpt}</pre>
            </section>
          </div>
          <p className="mt-3 text-xs text-ink-500">{t.leg.snapshot}</p>
        </Section>

        <section className="border-t border-line py-16 text-center md:py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900">{t.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-500">{t.ctaText}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={mailto} className="btn-gold">{t.talk}</a>
            <Link href="/login" className="btn-ghost">{t.login}</Link>
          </div>
          <p className="mx-auto mt-8 max-w-xl text-xs text-ink-500">{t.trail}</p>
        </section>
      </main>
    </div>
  );
}
