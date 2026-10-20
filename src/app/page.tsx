import Link from "next/link";
import { Logo, LogoMark } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { ChainIllustration } from "@/components/Illustrations";
import { ReconcileLive, type LiveRow } from "@/components/ReconcileLive";
import { CollectionLive, type CollectionLiveData } from "@/components/CollectionLive";
import { bandOf, buildOptions, updateDebt } from "@/lib/collection";
import { MalhaTransacoes } from "@/components/MalhaTransacoes";
import { HeroVideo } from "@/components/HeroVideo";
import { BRAND } from "@/lib/brand";

type Lang = "pt" | "en";

const T = {
  pt: {
    login: "Entrar",
    demo: "Ver a demonstração",
    explore: "Conhecer os módulos",
    heroTag: "Para cooperativas de crédito, financeiras e fintechs",
    h1a: "Da dívida em atraso",
    h1b: "ao acordo pago no Pix.",
    sub: "Atualize a dívida com multa e juros dentro do limite legal, ofereça propostas por faixa de atraso e envie o link por WhatsApp. O cliente escolhe a condição e paga por Pix, com baixa única. Conciliação, crédito e PLD/COAF na mesma plataforma.",
    talk: "Falar com a gente",
    mailSubject: "Quero conhecer a Livingstone",
    col: {
      title: "Cobrança · acordo por faixa de atraso",
      sample: "Dados de exemplo",
      overdue: "dias em atraso",
      principal: "Valor original",
      multa: "Multa (2%)",
      juros: "Juros de mora (1% a.m.)",
      updated: "Dívida atualizada",
      offers: "Propostas enviadas por WhatsApp",
      sent: "Cliente abriu o link e escolheu à vista",
      paid: "Pix recebido",
      once: "baixa única no acordo",
      aria: "Exemplo de cobrança: dívida em atraso atualizada com multa e juros, três propostas de acordo e o pagamento à vista recebido por Pix.",
      cash: "À vista",
      off: "de desconto",
      of: "de",
      contract: "contrato",
    },
    reconKicker: "Conciliação",
    reconTitle: "O retorno do banco cruzado com seus títulos",
    reconSub: "Lê CNAB 400 e 240, OFX e CSV, aplica as regras que você configurou e mostra o que bateu, o que divergiu, o que não foi pago e o crédito que ninguém esperava.",
    proofKicker: "Sem promessa no escuro",
    proofTitle: "Como você verifica",
    proofs: [
      ["Regras à vista", "Política de crédito, limites de PLD, multa e juros ficam em Configurações. Cada mudança é validada e entra na auditoria."],
      ["Trilha conferível na tela", "A página de Auditoria recalcula a corrente de registros e mostra se está íntegra ou em qual registro ela quebrou."],
      ["Os mesmos arquivos de exemplo", "O tour e a demonstração usam arquivos CNAB, OFX e CSV que você pode baixar e abrir. São os mesmos usados nos testes automatizados."],
      ["Quem vê o quê", "Perfis de Administrador, Analista e Auditor (só leitura), com cada consulta filtrada pela instituição do usuário."],
    ],
    flow: { inputs: ["CNAB 400", "OFX", "CSV", "Holerite", "COBOL"], outputs: ["Conciliado", "Divergente", "Não pago", "Não esperado"], core: "Regras auditáveis", chain: "Trilha encadeada" },
    live: {
      title: "Retorno do banco × títulos",
      sample: "Dados de exemplo",
      tol: "tolerância de 2 centavos",
      cols: ["Referência", "Esperado", "Recebido", "Status", "Regra"],
      matched: "conciliados",
      excess: "Pago a maior (excedente)",
      aria: "Exemplo de conciliação: títulos conciliados por referência e por valor e data, uma diferença de centavos dentro da tolerância, um Pix pago a maior, um título não pago e um crédito não esperado.",
      rules: ["Referência", "Valor e data"],
      notes: { tol: "Diferença de R$ 0,02 dentro da tolerância", excess: "Pix · pago a maior: R$ 27,40", unpaid: "Pagamento não localizado no arquivo do banco", unexpected: "Crédito sem título correspondente" },
      noTitle: "sem título",
    },
    formats: "Lê os arquivos que sua operação já usa",
    modulesKicker: "Módulos",
    secKicker: "Segurança",
    legacyKicker: "Modernização",
    modulesTitle: "Cinco rotinas que hoje consomem sua equipe",
    modules: [
      ["Conciliação bancária", "Lê o retorno CNAB 400, o extrato OFX ou CSV e cruza com os títulos esperados. Aponta o que bateu, o que divergiu, o que não foi pago e o crédito que ninguém esperava."],
      ["Análise de crédito", "Lê holerite e extrato, extrai renda e despesas, avisa de cheque devolvido, apostas e CPF divergente, e aplica a política de comprometimento de renda. A decisão é sempre por regra, então dá para auditar."],
      ["Cobrança e renegociação", "Atualiza a dívida, monta propostas por faixa de atraso e manda o link por WhatsApp. O devedor escolhe a condição e paga por Pix no mesmo lugar."],
      ["PLD / COAF", "Oito regras abrem casos por cliente com pontuação de risco, dossiê com evidências e prazo de 45 dias. Comunicação obrigatória não pode ser arquivada."],
      ["Código legado", "Recebe COBOL, Delphi ou VB6, explica o programa, extrai as regras de negócio e propõe a versão moderna para seu time revisar."],
    ],
    legacyTitle: "Do COBOL ao código que seu time entende",
    legacySub: "A plataforma lê o programa antigo, extrai as regras de negócio e entrega o equivalente moderno.",
    secTitle: "Cada passo registrado, cada alteração visível",
    sec: [
      ["Trilha encadeada", "Cada registro guarda o hash SHA-256 do anterior. Se alguém alterar ou apagar uma linha direto no banco, a corrente quebra e a tela de auditoria mostra em qual registro."],
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
    h1a: "From overdue debt",
    h1b: "to a deal paid by Pix.",
    sub: "Update the debt with fines and interest within legal limits, offer deals by days overdue and send the link on WhatsApp. The debtor picks one and pays by Pix, posted exactly once. Reconciliation, credit and AML/COAF in the same platform.",
    talk: "Talk to us",
    mailSubject: "I want to know Livingstone",
    col: {
      title: "Collections · deals by days overdue",
      sample: "Sample data",
      overdue: "days overdue",
      principal: "Original amount",
      multa: "Late fee (2%)",
      juros: "Late interest (1%/month)",
      updated: "Updated debt",
      offers: "Offers sent on WhatsApp",
      sent: "Debtor opened the link and chose upfront",
      paid: "Pix received",
      once: "posted once to the deal",
      aria: "Collections example: an overdue debt updated with fee and interest, three deal offers and the upfront payment received by Pix.",
      cash: "Upfront",
      off: "off",
      of: "of",
      contract: "contract",
    },
    reconKicker: "Reconciliation",
    reconTitle: "The bank return matched to your receivables",
    reconSub: "Reads CNAB 400 and 240, OFX and CSV, applies the rules you configured and shows what matched, what diverged, what is unpaid and the credit nobody expected.",
    proofKicker: "No promises in the dark",
    proofTitle: "How you check",
    proofs: [
      ["Rules in plain sight", "Credit policy, AML limits, fees and interest live in Settings. Every change is validated and written to the audit trail."],
      ["A trail you can check on screen", "The Audit page recomputes the chain of records and shows whether it is intact or where it broke."],
      ["The same sample files", "The tour and the demo use CNAB, OFX and CSV files you can download and open. They are the same ones used in the automated tests."],
      ["Who sees what", "Administrator, Analyst and Auditor (read-only) roles, with every query filtered by the user's institution."],
    ],
    flow: { inputs: ["CNAB 400", "OFX", "CSV", "Payslip", "COBOL"], outputs: ["Matched", "Divergent", "Unpaid", "Unexpected"], core: "Auditable rules", chain: "Chained trail" },
    live: {
      title: "Bank return × receivables",
      sample: "Sample data",
      tol: "2-cent tolerance",
      cols: ["Reference", "Expected", "Received", "Status", "Rule"],
      matched: "matched",
      excess: "Overpaid (excess)",
      aria: "Reconciliation example: receivables matched by reference and by amount and date, a cents difference within tolerance, an overpaid Pix, an unpaid receivable and an unexpected credit.",
      rules: ["Reference", "Amount and date"],
      notes: { tol: "R$ 0.02 difference within tolerance", excess: "Pix · overpaid by R$ 27.40", unpaid: "Payment not found in the bank file", unexpected: "Credit with no matching receivable" },
      noTitle: "no receivable",
    },
    formats: "Reads the files your operation already uses",
    modulesKicker: "Modules",
    secKicker: "Security",
    legacyKicker: "Modernization",
    modulesTitle: "Five routines that drain your team today",
    modules: [
      ["Bank reconciliation", "Reads CNAB 400 returns, OFX or CSV statements and matches them to expected receivables. Flags what matched, what diverged, what is unpaid and the credit nobody expected."],
      ["Credit analysis", "Reads payslips and statements, extracts income and expenses, warns about bounced checks, gambling and mismatched tax IDs, and applies your income-commitment policy. Decisions are rule-based, so they can be audited."],
      ["Collections and renegotiation", "Updates the debt, builds offers by days overdue and sends the link on WhatsApp. The debtor picks a deal and pays by Pix in the same place."],
      ["AML / COAF", "Eight rules open cases per client with risk scores, an evidence dossier and a 45-day deadline. Mandatory reports cannot be archived."],
      ["Legacy code", "Takes COBOL, Delphi or VB6, explains the program, extracts the business rules and proposes a modern version for your team to review."],
    ],
    legacyTitle: "From COBOL to code your team understands",
    legacySub: "The platform reads the old program, extracts the business rules and delivers the modern equivalent.",
    secTitle: "Every step recorded, every change visible",
    sec: [
      ["Chained trail", "Each record stores the SHA-256 hash of the previous one. If someone edits or deletes a row straight in the database, the chain breaks and the audit screen shows where."],
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

const FORMATS = ["CNAB 400", "CNAB 240", "OFX", "CSV", "Pix", "COBOL", "Delphi", "VB6"];
const MODULE_ICONS = ["conciliacao", "credito", "cobranca", "pld", "legado"];
const SEC_ICONS = ["chain", "usuarios", "lock", "check"];
const OUT_COLORS = ["#34b59a", "#e0b84a", "#f87171", "#a78bfa"];

// Exemplo do hero calculado pelas regras reais da cobrança (datas fixas para não mudar a cada build).
const REF_DATE = new Date("2026-10-01T12:00:00Z");
const DUE_DATE = new Date("2026-06-29T12:00:00Z");
const PRINCIPAL = 2400;
const brl = (n: number, lang: Lang) => n.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { style: "currency", currency: "BRL" });

function collectionData(lang: Lang, l: (typeof T)[Lang]["col"]): CollectionLiveData {
  const d = updateDebt(PRINCIPAL, DUE_DATE, REF_DATE);
  const opts = buildOptions(d.total, PRINCIPAL, d.days);
  const pick = [opts[0], opts.find((o) => o.installments === 6), opts.find((o) => o.installments === 12)].filter((o) => o !== undefined);
  return {
    debtor: "Maria S.",
    contract: `${l.contract} 004512`,
    days: d.days,
    band: bandOf(d.days).label,
    principal: brl(PRINCIPAL, lang),
    multa: brl(d.multa, lang),
    juros: brl(d.juros, lang),
    total: brl(d.total, lang),
    options: pick.map((o) =>
      o.installments === 1
        ? { label: l.cash, total: brl(o.total, lang), detail: `${o.discountPct.toFixed(0)}% ${l.off}`, best: true }
        : { label: o.label, total: brl(o.installment, lang), detail: `${l.of} ${brl(o.total, lang)}` },
    ),
    paid: brl(opts[0].total, lang),
  };
}

// Linhas ilustrativas do hero; status e notas seguem as regras de src/lib/reconcile.ts.
function liveRows(l: (typeof T)[Lang]["live"]): LiveRow[] {
  return [
    { ref: "00012345", expected: "R$ 480,00", received: "R$ 480,00", status: 0, rule: l.rules[0] },
    { ref: "00012346", expected: "R$ 1.250,00", received: "R$ 1.249,98", status: 0, rule: l.rules[0], note: l.notes.tol, mark: "tol" },
    { ref: "00012347", expected: "R$ 320,00", received: "R$ 320,00", status: 0, rule: l.rules[1] },
    { ref: "00012348", expected: "R$ 900,00", received: "R$ 927,40", status: 1, rule: l.rules[0], note: l.notes.excess, mark: "excess" },
    { ref: "00012349", expected: "R$ 615,00", received: "—", status: 2, rule: "", note: l.notes.unpaid },
    { ref: l.noTitle, expected: "—", received: "R$ 150,00", status: 3, rule: "", note: l.notes.unexpected },
  ];
}

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: q } = await searchParams;
  const lang: Lang = q === "en" ? "en" : "pt";
  const t = T[lang];
  const col = collectionData(lang, t.col);
  const tour = lang === "en" ? "/tour?lang=en" : "/tour";
  const mail = `mailto:${BRAND.contact}?subject=${encodeURIComponent(t.mailSubject)}`;

  return (
    <div className="bg-paper text-ink-900">
      <header className="on-ink absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Logo />
          <nav className="flex items-center gap-3 text-sm text-brand-100 sm:gap-4" aria-label={lang === "pt" ? "Idioma e acesso" : "Language and access"}>
            <span className="flex items-center gap-0.5 rounded-full border border-white/15 p-0.5 text-xs">
              {(["pt", "en"] as const).map((l) => (
                <Link key={l} href={l === "pt" ? "/" : "/?lang=en"} aria-current={l === lang ? "true" : undefined} className={`rounded-full px-2.5 py-1 uppercase transition-colors ${l === lang ? "bg-white/15 text-white" : "hover:text-white"}`}>
                  {l}
                </Link>
              ))}
            </span>
            <Link href="/login" className="rounded-xl border border-white/20 px-4 py-2 font-medium text-white transition-colors hover:border-white/40 hover:bg-white/10">
              {t.login}
            </Link>
          </nav>
        </div>
      </header>

      <section className="on-ink surface-ink bg-ink-950 pb-16 pt-32 md:pb-20 md:pt-40">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_75%)]" aria-hidden="true" />
        <MalhaTransacoes className="[mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_75%)]" />
        <div className="pointer-events-none absolute -right-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-brand-600/25 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-[1.05fr_1fr]">
          <div className="rise">
            <p className="eyebrow flex items-center gap-3 text-gold-300">
              <span className="rule-gold" aria-hidden="true" />
              {t.heroTag}
            </p>
            <h1 className="font-display mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-7xl">
              {t.h1a}
              <br />
              <span className="italic text-gold-400">{t.h1b}</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-brand-100/85">{t.sub}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href={tour} className="btn-gold">
                {t.demo}
                <Icon name="arrow" size={16} />
              </Link>
              <a href={mail} className="btn-outline-light">
                {t.talk}
              </a>
            </div>
          </div>

          <div className="rise relative min-w-0 sm:hidden" style={{ animationDelay: "120ms" }}>
            <div className="rounded-[1.5rem] border border-white/10 bg-ink-900/70 p-4 shadow-2xl">
              <CollectionLive compact labels={t.col} data={col} />
            </div>
          </div>

          <div className="rise relative hidden min-w-0 sm:block" style={{ animationDelay: "120ms" }}>
            <div className="rounded-[1.75rem] border border-white/10 bg-ink-900/70 p-5 shadow-2xl md:p-7">
              <CollectionLive labels={t.col} data={col} />
            </div>
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-6xl px-6 md:mt-24">
          <div className="flex flex-col gap-4 border-t border-white/10 pt-6 md:flex-row md:items-center md:gap-8">
            <p className="eyebrow shrink-0 text-brand-100/60">{t.formats}</p>
            <ul className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <li key={f} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-brand-100/80">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-ink-950 px-6 pb-16 md:pb-24">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[1.75rem] border border-white/10 shadow-2xl">
          <HeroVideo
            src="/video/livingstone-hero.mp4"
            poster="/video/livingstone-hero-poster.png"
            label="Animação: lançamentos do banco sendo conciliados automaticamente, seguidos dos módulos de cobrança, crédito e PLD"
          />
        </div>
      </section>

      <section className="on-ink surface-ink bg-ink-950 pb-20 md:pb-28">
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="eyebrow flex items-center gap-3 text-gold-300">
              <span className="rule-gold" aria-hidden="true" />
              {t.reconKicker}
            </p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight text-balance md:text-4xl">{t.reconTitle}</h2>
            <p className="mt-5 max-w-md leading-relaxed text-brand-100/80">{t.reconSub}</p>
          </div>
          <div className="min-w-0 rounded-[1.75rem] border border-white/10 bg-ink-900/70 p-4 shadow-2xl sm:p-5 md:p-7">
            <div className="sm:hidden">
              <ReconcileLive compact labels={{ ...t.live, statuses: t.flow.outputs }} colors={OUT_COLORS} excessValue="R$ 27,40" rows={liveRows(t.live)} />
            </div>
            <div className="hidden sm:block">
              <ReconcileLive labels={{ ...t.live, statuses: t.flow.outputs }} colors={OUT_COLORS} excessValue="R$ 27,40" rows={liveRows(t.live)} />
            </div>
          </div>
        </div>
      </section>

      <section id="modulos" className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <p className="eyebrow flex items-center gap-3">
          <span className="rule-gold" aria-hidden="true" />
          {t.modulesKicker}
        </p>
        <h2 className="font-display mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">{t.modulesTitle}</h2>
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
          {t.modules.map(([title, body], i) => {
            const dark = i === 3;
            return (
              <article key={title} className={`flex flex-col p-7 md:p-8 ${dark ? "on-ink bg-ink-900 text-white" : "bg-white"} ${i === 4 ? "md:col-span-2" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${dark ? "bg-white/10 text-gold-300" : "bg-brand-50 text-brand-700"}`}>
                    <Icon name={MODULE_ICONS[i]} size={22} />
                  </span>
                  <span className={`font-display text-2xl tabular-nums ${dark ? "text-gold-400" : "text-ink-500/40"}`} aria-hidden="true">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold tracking-tight">{title}</h3>
                <p className={`mt-2 max-w-prose text-[15px] leading-relaxed ${dark ? "text-brand-100/80" : "text-ink-600"}`}>{body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-line bg-white py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <p className="eyebrow flex items-center gap-3">
            <span className="rule-gold" aria-hidden="true" />
            {t.legacyKicker}
          </p>
          <h2 className="font-display mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">{t.legacyTitle}</h2>
          <p className="mt-4 max-w-2xl text-lg text-ink-600">{t.legacySub}</p>
          <div className="mt-12 grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
            <pre className="overflow-x-auto rounded-2xl border border-ink-800 bg-ink-950 p-5 font-mono text-[13px] leading-6 text-amber-200/90">
              <span className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true" />
                COBOL
              </span>
              {COBOL}
            </pre>
            <div className="flex items-center justify-center text-brand-600" aria-hidden="true">
              <span className="flex h-10 w-10 rotate-90 items-center justify-center rounded-full border border-line bg-paper md:rotate-0">
                <Icon name="arrow" size={18} />
              </span>
            </div>
            <pre className="overflow-x-auto rounded-2xl border border-ink-800 bg-ink-900 p-5 font-mono text-[13px] leading-6 text-brand-100">
              <span className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden="true" />
                TypeScript
              </span>
              {TS}
            </pre>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-14 px-6 py-24 md:py-32 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="eyebrow flex items-center gap-3">
            <span className="rule-gold" aria-hidden="true" />
            {t.secKicker}
          </p>
          <h2 className="font-display mt-4 max-w-md text-4xl font-semibold tracking-tight text-balance md:text-5xl">{t.secTitle}</h2>
          <div className="mt-10 max-w-sm text-brand-600">
            <ChainIllustration />
          </div>
        </div>
        <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2">
          {t.sec.map(([title, body], i) => (
            <div key={title} className="bg-white p-6 md:p-7">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-900 text-gold-300">
                <Icon name={SEC_ICONS[i]} size={18} />
              </span>
              <h3 className="mt-5 font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <p className="eyebrow flex items-center gap-3">
          <span className="rule-gold" aria-hidden="true" />
          {t.proofKicker}
        </p>
        <h2 className="font-display mt-4 text-4xl font-semibold tracking-tight text-balance md:text-5xl">{t.proofTitle}</h2>
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.proofs.map(([title, body], i) => (
            <li key={title} className="border-t border-ink-900/15 pt-5">
              <span className="font-display text-2xl text-brand-600 tabular-nums" aria-hidden="true">
                0{i + 1}
              </span>
              <h3 className="mt-3 font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="on-ink surface-ink bg-ink-900 py-24 text-center md:py-28">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden="true" />
        <div className="relative mx-auto max-w-2xl px-6">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-balance md:text-5xl">{t.ctaTitle}</h2>
          <p className="mt-5 text-lg text-brand-100/85">{t.ctaSub}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href={tour} className="btn-gold">
              {t.demo}
              <Icon name="arrow" size={16} />
            </Link>
            <a href={mail} className="btn-outline-light">
              {t.talk}
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-ink-950 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 text-xs text-slate-400">
          <span className="flex items-center gap-2">
            <LogoMark size={20} />© {new Date().getFullYear()} {BRAND.name}
          </span>
          <span>{t.foot}</span>
        </div>
      </footer>
    </div>
  );
}
