// Teste rápido dos módulos com os arquivos de public/demo: npx tsx scripts/testar-modulos.mts
import { readFileSync } from "node:fs";
import { parseBankFile, parseExpectedCsv, reconcile } from "../src/lib/reconcile";
import { analyzeCredit } from "../src/lib/credit";
import { analyzeLegacy } from "../src/lib/legacy";

const demo = (f: string) => readFileSync(new URL(`../public/demo/${f}`, import.meta.url));
const count = (items: { status: string }[]) =>
  items.reduce<Record<string, number>>((a, i) => ((a[i.status] = (a[i.status] ?? 0) + 1), a), {});

const expected = parseExpectedCsv(demo("titulos_esperados.csv").toString());
for (const f of ["retorno_cnab400.ret", "extrato.ofx"]) {
  const { format, entries } = parseBankFile(f, demo(f).toString());
  console.log(`${f} → ${format}, ${entries.length} créditos`, count(reconcile(expected, entries)));
}

const doc = (name: string) => ({ name, mime: "text/plain", data: demo(name) });
const maria = await analyzeCredit(
  { applicant: "Maria Aparecida Souza", document: "123.456.789-09", requested: 15000, months: 24, monthlyRate: 0.025 },
  [doc("holerite_maria.txt"), doc("extrato_maria.csv")],
);
console.log("Maria:", maria.decision, maria.score, maria.flags.map((f) => f.texto));
const joao = await analyzeCredit(
  { applicant: "João Pereira", document: "111.222.333-44", requested: 20000, months: 12, monthlyRate: 0.03 },
  [doc("holerite_joao.txt"), doc("extrato_joao.csv")],
);
console.log("João:", joao.decision, joao.score, joao.flags.map((f) => f.texto));

const leg = await analyzeLegacy("CALCJUROS.cbl", demo("CALCJUROS.cbl").toString(), "TypeScript");
console.log(leg.summary, "\n", leg.rules, "\n", leg.modernCode);
