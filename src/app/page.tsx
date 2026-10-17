import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND } from "@/lib/brand";

type Lang = "pt" | "en";

const T = {
  pt: {
    login: "Entrar",
    demo: "Ver a demonstração",
    explore: "Conhecer os módulos",
    heroTag: "Para cooperativas de crédito, financeiras e fintechs",
    h1a: "Menos planilha.",
    h1b: "Mais decisão.",
    sub: "Conciliação, crédito, cobrança e PLD/COAF em uma só plataforma. A IA explica cada resultado e toda ação fica registrada em uma trilha que ninguém consegue adulterar.",
    mock: { recovered: "Recuperado em cobrança", sample: "Dados de demonstração", case: "Caso de PLD", risk: "Risco alto · 82", rule1: "Espécie acima de R$ 50 mil", rule2: "Fracionamento em 5 depósitos", rule3: "Incompatível com a renda declarada", due: "Prazo: 12 dias", coe: "Comunicação obrigatória" },
    modulesTitle: "Cinco rotinas que hoje consomem sua equipe",
    modules: [
      ["Conciliação bancária", "Lê o retorno CNAB 400, o extrato OFX ou CSV e cruza com os títulos esperados. Aponta o que bateu, o que divergiu, o que não foi pago e o crédito que ninguém esperava."],
      ["Análise de crédito", "Lê holerite e extrato, extrai renda e despesas, avisa de cheque devolvido, apostas e CPF divergente, e aplica a política de comprometimento de renda. A decisão é sempre por regra, então dá para auditar."],
      ["Cobrança e renegociação", "Atualiza a dívida, monta propostas por faixa de atraso e manda o link por WhatsApp. O devedor escolhe a condição e paga por Pix no mesmo lugar."],
      ["PLD / COAF", "Oito regras abrem casos por cliente com pontuação de risco, dossiê com evidências e prazo de 45 dias. Comunicação obrigatória não pode ser arquivada."],
      ["Código legado", "Recebe COBOL, Delphi ou VB6, explica o programa, extrai as regras de negócio e gera a versão moderna."],
    ],
    legacyTitle: "Do COBOL ao código que seu time entende",
    legacySub: "A plataforma lê o programa antigo, extrai as regras de negócio e entrega o equivalente moderno.",
    secTitle: "Feito para passar em auditoria",
    sec: [
      ["Trilha encadeada", "Cada registro guarda o hash SHA-256 do anterior. Alterar ou apagar qualquer linha direto no banco quebra a corrente, e a tela de auditoria mostra."],
      ["Dados separados por organização", "Toda consulta filtra pela instituição do usuário. Perfis de Administrador, Analista e Auditor."],
      ["Login e sessão endurecidos", "Bloqueio após tentativas, sessão derrubada na hora ao trocar senha ou perfil, cabeçalhos de segurança e uploads validados pelo conteúdo."],
      ["Pix sem baixa duplicada", "Cada Pix é baixado uma única vez, mesmo com cliques ou webhooks simultâneos."],
    ],
    ctaTitle: "Veja funcionando com dados de exemplo",
    ctaSub: "Entre na demonstração, importe os arquivos de exemplo e acompanhe cada módulo.",
    foot: "Operações bancárias com IA",
  },
  en: {
    login: "Sign in",
    demo: "See the demo",
    explore: "Explore the modules",
    heroTag: "For credit unions, lenders and fintechs",
    h1a: "Less spreadsheet.",
    h1b: "More decisions.",
    sub: "Reconciliation, credit, collections and AML/COAF in one platform. The AI explains every result and every action is written to a trail no one can tamper with.",
    mock: { recovered: "Recovered in collections", sample: "Demo data", case: "AML case", risk: "High risk · 82", rule1: "Cash above R$ 50k", rule2: "Structuring across 5 deposits", rule3: "Inconsistent with declared income", due: "Deadline: 12 days", coe: "Mandatory report" },
    modulesTitle: "Five routines that drain your team today",
    modules: [
      ["Bank reconciliation", "Reads CNAB 400 returns, OFX or CSV statements and matches them to expected receivables. Flags what matched, what diverged, what is unpaid and the credit nobody expected."],
      ["Credit analysis", "Reads payslips and statements, extracts income and expenses, warns about bounced checks, gambling and mismatched tax IDs, and applies your income-commitment policy. Decisions are rule-based, so they can be audited."],
      ["Collections and renegotiation", "Updates the debt, builds offers by days overdue and sends the link on WhatsApp. The debtor picks a deal and pays by Pix in the same place."],
      ["AML / COAF", "Eight rules open cases per client with risk scores, an evidence dossier and a 45-day deadline. Mandatory reports cannot be archived."],
      ["Legacy code", "Takes COBOL, Delphi or VB6, explains the program, extracts the business rules and generates the modern version."],
    ],
    legacyTitle: "From COBOL to code your team understands",
    legacySub: "The platform reads the old program, extracts the business rules and delivers the modern equivalent.",
    secTitle: "Built to pass an audit",
    sec: [
      ["Chained trail", "Each record stores the SHA-256 hash of the previous one. Editing or deleting any row straight in the database breaks the chain, and the audit screen shows it."],
      ["Data separated per organization", "Every query filters by the user's institution. Administrator, Analyst and Auditor roles."],
      ["Hardened login and sessions", "Lockout after failed attempts, sessions dropped instantly on password or role change, security headers and content-validated uploads."],
      ["Pix with no double posting", "Each Pix is posted exactly once, even with simultaneous clicks or webhooks."],
    ],
    ctaTitle: "See it working with sample data",
    ctaSub: "Sign in to the demo, import the sample files and follow each module.",
    foot: "AI-powered banking operations",
  },
} as const;

const COBOL = `COMPUTE JUROS = SALDO * TAXA * DIAS / 30
IF DIAS-ATRASO > 0
   COMPUTE MULTA = SALDO * 0.02
   ADD MULTA TO JUROS
END-IF.`;

const TS = `function updateDebt(balance: number, daysLate: number) {
  if (daysLate <= 0) return balance;
  const fine = balance * 0.02;
  const interest = balance * 0.01 * (daysLate / 30);
  return balance + fine + interest;
}`;

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: q } = await searchParams;
  const lang: Lang = q === "en" ? "en" : "pt";
  const t = T[lang];

  return (
    <div className="bg-white text-slate-900">
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Logo />
          <nav className="flex items-center gap-4 text-sm text-brand-100">
            <span className="flex items-center gap-1 rounded-full border border-white/15 p-0.5 text-xs">
              {(["pt", "en"] as const).map((l) => (
                <Link key={l} href={l === "pt" ? "/" : "/?lang=en"} aria-current={l === lang ? "true" : undefined} className={`rounded-full px-2.5 py-1 uppercase ${l === lang ? "bg-white/15 text-white" : "hover:text-white"}`}>
                  {l}
                </Link>
              ))}
            </span>
            <Link href="/login" className="rounded-lg border border-white/20 px-4 py-2 font-medium text-white transition hover:bg-white/10">
              {t.login}
            </Link>
          </nav>
        </div>
      </header>

      <section className="bg-grid relative overflow-hidden bg-ink-900 pb-24 pt-32 text-white">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-brand-600/30 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2">
          <div className="rise">
            <p className="mb-5 inline-flex rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1 text-xs font-medium text-gold-300">{t.heroTag}</p>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
              {t.h1a}
              <br />
              <span className="text-gold-400">{t.h1b}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-brand-100/85">{t.sub}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/login" className="rounded-lg bg-gold-400 px-6 py-3 font-semibold text-ink-900 transition hover:bg-gold-300">
                {t.demo}
              </Link>
              <a href="#modulos" className="rounded-lg border border-white/20 px-6 py-3 font-medium text-white transition hover:bg-white/10">
                {t.explore}
              </a>
            </div>
          </div>

          <div className="rise relative" style={{ animationDelay: "120ms" }} aria-hidden="true">
            <div className="rounded-3xl bg-white p-5 text-slate-900 shadow-2xl ring-1 ring-white/10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.mock.recovered}</p>
                  <p className="font-display mt-1 text-4xl font-semibold tabular-nums text-brand-700">R$ 184.320</p>
                </div>
                <span className="badge bg-slate-100 text-slate-500">{t.mock.sample}</span>
              </div>
              <svg viewBox="0 0 400 90" className="mt-3 h-auto w-full">
                <defs>
                  <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#0d9488" stopOpacity="0.25" />
                    <stop offset="1" stopColor="#0d9488" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 78 L50 70 L100 72 L150 56 L200 58 L250 38 L300 30 L350 18 L400 10 L400 90 L0 90Z" fill="url(#hg)" />
                <path d="M0 78 L50 70 L100 72 L150 56 L200 58 L250 38 L300 30 L350 18 L400 10" fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="draw" />
                <circle cx="400" cy="10" r="4.5" fill="#0d9488" stroke="#fff" strokeWidth="2" />
              </svg>
            </div>
            <div className="absolute -bottom-10 -left-4 w-80 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl md:-left-10">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">{t.mock.case}</span>
                <span className="badge bg-red-100 text-red-800">{t.mock.risk}</span>
              </div>
              <ul className="space-y-1 text-xs text-slate-600">
                {[t.mock.rule1, t.mock.rule2, t.mock.rule3].map((r) => (
                  <li key={r} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-chart-4" />
                    {r}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="badge whitespace-nowrap bg-red-600 text-white">{t.mock.coe}</span>
                <span className="whitespace-nowrap text-slate-500">{t.mock.due}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="modulos" className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="font-display max-w-2xl text-4xl font-semibold tracking-tight text-ink-900">{t.modulesTitle}</h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {t.modules.map(([title, body], i) => (
            <article key={title} className={`rounded-2xl border border-slate-200 p-6 transition hover:border-brand-200 hover:shadow-lg ${i === 3 ? "bg-ink-900 text-white" : "bg-white"}`}>
              <span className={`font-display text-sm ${i === 3 ? "text-gold-400" : "text-brand-600"}`}>0{i + 1}</span>
              <h3 className="mt-2 text-lg font-semibold">{title}</h3>
              <p className={`mt-2 text-sm leading-relaxed ${i === 3 ? "text-brand-100/80" : "text-slate-600"}`}>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-brand-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display max-w-2xl text-4xl font-semibold tracking-tight text-ink-900">{t.legacyTitle}</h2>
          <p className="mt-3 max-w-2xl text-slate-600">{t.legacySub}</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <pre className="overflow-x-auto rounded-2xl bg-ink-950 p-5 font-mono text-[13px] leading-6 text-amber-200/90">
              <span className="mb-2 block text-xs uppercase tracking-widest text-slate-500">COBOL</span>
              {COBOL}
            </pre>
            <pre className="overflow-x-auto rounded-2xl bg-ink-900 p-5 font-mono text-[13px] leading-6 text-brand-100">
              <span className="mb-2 block text-xs uppercase tracking-widest text-slate-500">TypeScript</span>
              {TS}
            </pre>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="font-display max-w-2xl text-4xl font-semibold tracking-tight text-ink-900">{t.secTitle}</h2>
        <div className="mt-12 grid gap-x-12 gap-y-8 md:grid-cols-2">
          {t.sec.map(([title, body]) => (
            <div key={title} className="flex gap-4">
              <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-grid bg-ink-900 py-24 text-center text-white">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="font-display text-4xl font-semibold tracking-tight">{t.ctaTitle}</h2>
          <p className="mt-4 text-brand-100/85">{t.ctaSub}</p>
          <Link href="/login" className="mt-8 inline-flex rounded-lg bg-gold-400 px-7 py-3 font-semibold text-ink-900 transition hover:bg-gold-300">
            {t.demo}
          </Link>
        </div>
      </section>

      <footer className="bg-ink-950 py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {BRAND.name} · {t.foot}
      </footer>
    </div>
  );
}
