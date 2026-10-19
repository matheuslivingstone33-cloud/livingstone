// Testes automáticos dos módulos: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validCnpj, validCpf } from "../src/lib/validators";
import { DEFAULT_CNAB400, parseBankFile, parseExpectedCsv, reconcile, reconcileWith, summarize } from "../src/lib/reconcile";
import { buildOptions, crc16, decidePayment, parseDebtsCsv, parseTxid, pixPayload, pixTxid, updateDebt } from "../src/lib/collection";
import { analyzeClient, groupByClient, parseTransactionsCsv, scoreOf } from "../src/lib/pld";
import { buildIndex, nameKey, parseList } from "../src/lib/lists";
import { analyzeCredit } from "../src/lib/credit";
import { analyzeLegacy } from "../src/lib/legacy";
import { DEFAULTS, validateSettings } from "../src/lib/settings";
import { auditHash, passwordProblem } from "../src/lib/auth";
import { buildTourData } from "../src/lib/tour";
import { isPublic } from "../src/lib/public-routes";

const demo = (f: string) => readFileSync(new URL(`../public/demo/${f}`, import.meta.url));

test("CPF e CNPJ: dígitos verificadores", () => {
  assert.ok(validCpf("123.456.789-09"));
  assert.ok(!validCpf("123.456.789-00"));
  assert.ok(!validCpf("111.111.111-11"));
  assert.ok(validCnpj("11.222.333/0001-81"));
  assert.ok(!validCnpj("11.222.333/0001-80"));
});

test("Conciliação CNAB 400: resultado conhecido dos dados de exemplo", () => {
  const expected = parseExpectedCsv(demo("titulos_esperados.csv").toString());
  const { format, entries } = parseBankFile("r.ret", demo("retorno_cnab400.ret").toString());
  assert.equal(format, "CNAB400");
  const items = reconcile(expected, entries);
  const n = (st: string) => items.filter((i) => i.status === st).length;
  assert.deepEqual([n("CONCILIADO"), n("DIVERGENTE"), n("PENDENTE"), n("NAO_ESPERADO")], [7, 2, 3, 1]);
});

test("Conciliação CNAB 400: layout configurável muda as posições lidas", () => {
  const line = "1" + " ".repeat(9) + "00012345" + " ".repeat(82) + "06" + "151026" + " ".repeat(137) + "0000000010050" + " ".repeat(134);
  const { entries } = parseBankFile("x.ret", line.padEnd(400), { ...DEFAULT_CNAB400, nossoNumero: [11, 18], ocorrencia: [101, 102], dataOcorrencia: [103, 108], valorPago: [246, 258] });
  assert.equal(entries[0].reference, "00012345");
  assert.equal(entries[0].amount, 100.5);
});

test("Conciliação CNAB 240 (FEBRABAN) e nosso número com dígito verificador", () => {
  const seg = (s: string) => s.padEnd(240, " ");
  const t = seg("0010001" + "3" + "00001" + "T" + " " + "06" + " ".repeat(20) + "00000000000123457" + "   " + " ".repeat(24) + "000000000015000");
  const u = seg("0010001" + "3" + "00002" + "U" + " " + "06" + " ".repeat(60) + "000000000015000" + " ".repeat(45) + "14102026");
  const file = ["0".repeat(240), t, u, "9".repeat(240)].join("\n");
  const { format, entries } = parseBankFile("r.ret", file);
  assert.equal(format, "CNAB240");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].amount, 150);
  // Título esperado sem o dígito final "7": casa com o nosso número 123457
  const items = reconcile([{ reference: "12345", amount: 150 }], entries);
  assert.equal(items[0].status, "CONCILIADO");
});

const ofx = (...trns: string[]) =>
  `OFXHEADER:100\n<OFX><BANKTRANLIST>\n${trns.map((t) => `<STMTTRN><TRNTYPE>CREDIT${t}</STMTTRN>`).join("\n")}\n</BANKTRANLIST></OFX>`;
const counts = (items: ReturnType<typeof reconcile>) => {
  const s = summarize(items);
  return [s.matched, s.divergent, s.missing, s.unexpected];
};

test("Conciliação OFX: resultado conhecido do extrato de exemplo (tarifa ignorada)", () => {
  const expected = parseExpectedCsv(demo("titulos_esperados.csv").toString());
  const { format, entries } = parseBankFile("extrato.ofx", demo("extrato.ofx").toString());
  assert.equal(format, "OFX");
  const items = reconcile(expected, entries);
  assert.deepEqual(counts(items), [5, 1, 6, 0]);
  const g = items.find((i) => i.reference === "10000112")!;
  assert.equal(g.status, "DIVERGENTE");
  assert.equal(g.excess, undefined); // pago a menor não é excedente
  assert.ok(items.filter((i) => i.status === "CONCILIADO").every((i) => i.rule === "REFERENCIA"));
});

test("Conciliação por valor e data: só com a opção ligada e dentro da tolerância de dias", () => {
  const expected = parseExpectedCsv(demo("titulos_esperados.csv").toString());
  const { entries } = parseBankFile("x.ofx", ofx("<DTPOSTED>20261011120000<TRNAMT>980.00<FITID>X1<MEMO>PIX RECEBIDO"));
  assert.equal(reconcile(expected, entries).find((i) => i.reference === "10000108")!.status, "PENDENTE");
  const ok = reconcileWith(expected, entries, { casarPorValorData: true, toleranciaDias: 3 }).find((i) => i.reference === "10000108")!;
  assert.equal(ok.status, "CONCILIADO");
  assert.equal(ok.rule, "VALOR_DATA");
  const far = reconcileWith(expected, entries, { casarPorValorData: true, toleranciaDias: 1 });
  assert.equal(far.find((i) => i.reference === "10000108")!.status, "PENDENTE");
  assert.equal(far.find((i) => i.status === "NAO_ESPERADO")?.receivedAmount, 980);
});

test("Conciliação por valor e data: ambiguidade não casa", () => {
  const exp = [
    { reference: "A1", amount: 1250, dueAt: new Date(Date.UTC(2026, 9, 5)) },
    { reference: "A2", amount: 1250, dueAt: new Date(Date.UTC(2026, 9, 5)) },
  ];
  const { entries } = parseBankFile("x.ofx", ofx("<DTPOSTED>20261005<TRNAMT>1250.00<FITID>Z9"));
  const items = reconcileWith(exp, entries, { casarPorValorData: true, toleranciaDias: 3 });
  assert.deepEqual(counts(items), [0, 0, 2, 1]);
  assert.match(items[0].note!, /manualmente/);
});

test("Conciliação: excedente e tolerância de centavos", () => {
  const exp = [{ reference: "10000101", amount: 1250 }, { reference: "10000102", amount: 100 }];
  const rec = [{ reference: "10000101", amount: 1300 }, { reference: "10000102", amount: 100.01 }];
  const strict = reconcile(exp, rec);
  assert.equal(strict[0].excess, 50);
  assert.equal(summarize(strict).excess, 50.01);
  const tol = reconcileWith(exp, rec, { toleranciaCentavos: 1 });
  assert.equal(tol[1].status, "CONCILIADO");
  assert.match(tol[1].note!, /tolerância/);
  assert.equal(tol[1].excess, undefined);
  assert.equal(tol[0].status, "DIVERGENTE");
});

test("Pix: CRC do exemplo oficial do Banco Central e txid de ida e volta", () => {
  const ref = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
  assert.equal(crc16(ref), "1D3D");
  const p = pixPayload(150.5, "ABC123", "Teste", { key: "pix@exemplo.com.br", merchant: "COOP", city: "SAO PAULO", webhookSecret: "" })!;
  assert.equal(crc16(p.slice(0, -4)), p.slice(-4));
  assert.equal(pixPayload(10, "X", undefined, { ...DEFAULTS.pix, key: "" }), null);
  const tx = pixTxid("AbCdEfGhJkMnPqRsTu", 3);
  assert.ok(tx.length <= 25);
  assert.deepEqual(parseTxid(tx), { tokenPrefix: "AbCdEfGhJkMnPqRsTu", installment: 3 });
});

test("Cobrança: multa limitada a 2%, piso e parcela mínima", () => {
  const due = new Date(Date.now() - 400 * 86_400_000);
  const u = updateDebt(1000, due, new Date(), { ...DEFAULTS.collection, multa: 0.1 });
  assert.equal(u.multa, 20); // mesmo configurado 10%, aplica no máximo 2%
  const opts = buildOptions(u.total, 1000, u.days);
  assert.ok(opts.every((o) => o.total >= 400)); // piso de 40% do original
  assert.ok(opts.every((o) => o.installment >= 50));
  assert.equal(parseDebtsCsv(demo("carteira_inadimplentes.csv").toString()).length, 12);
});

test("PLD: cenários de exemplo detectados e clientes normais sem alerta", () => {
  const txs = parseTransactionsCsv(demo("transacoes_pld.csv").toString());
  const lists = buildIndex([{ source: "INTERNA", name: "Construtora Horizonte Azul", nameKey: nameKey("Construtora Horizonte Azul"), document: "99888777000166" }]);
  const r = Object.fromEntries([...groupByClient(txs).values()].map((l) => [l[0].clientName, analyzeClient(l, DEFAULTS.pld, lists).map((a) => a.rule)]));
  assert.deepEqual(r["Ana Paula Ribeiro"], []);
  assert.deepEqual(r["Sandra Melo Cavalcanti"], []);
  assert.ok(r["José Antônio Ferraz"].includes("FRACIONAMENTO"));
  assert.ok(r["Comercial Ouro Fino Ltda"].includes("ESPECIE_50K"));
  assert.ok(r["Diego Souza Lima"].includes("PASSAGEM_RAPIDA"));
  assert.ok(r["Larissa Monteiro Alves"].includes("MULTIPLOS_DEPOSITANTES"));
  assert.ok(r["Fernando Aguiar Neto"].includes("LISTA_RESTRITIVA") && r["Fernando Aguiar Neto"].includes("PEP"));
});

test("PLD: limite configurável altera a detecção", () => {
  const txs = parseTransactionsCsv(demo("transacoes_pld.csv").toString());
  const ouro = [...groupByClient(txs).values()].find((l) => l[0].clientName.startsWith("Comercial"))!;
  assert.ok(!analyzeClient(ouro, { ...DEFAULTS.pld, cashLimit: 100_000 }).some((a) => a.rule === "ESPECIE_50K"));
  assert.equal(scoreOf([]).risk, "BAIXO");
});

test("Listas oficiais: CSNU (XML), OFAC (CSV) e PEP da CGU (CPF mascarado)", () => {
  const csnu = parseList("CSNU", "<INDIVIDUALS><INDIVIDUAL><FIRST_NAME>JOHN</FIRST_NAME><SECOND_NAME>DOE</SECOND_NAME><REFERENCE_NUMBER>QDi.001</REFERENCE_NUMBER><INDIVIDUAL_ALIAS><ALIAS_NAME>JD</ALIAS_NAME></INDIVIDUAL_ALIAS></INDIVIDUAL></INDIVIDUALS>");
  assert.equal(csnu.length, 2);
  const ofac = parseList("OFAC", '36,"AEROCARIBBEAN AIRLINES","-0- ","CUBA","-0-"\n');
  assert.equal(ofac[0].name, "AEROCARIBBEAN AIRLINES");
  const pep = parseList("PEP", '"CPF";"Nome_PEP";"Descrição_Função";"Nome_Órgão"\n"***.999.333-**";"FERNANDO AGUIAR NETO";"DEPUTADO ESTADUAL";"ASSEMBLEIA"\n');
  const idx = buildIndex(pep);
  assert.equal(idx.match("666.999.333-80", "Fernando Aguiar Neto")?.source, "PEP");
  assert.equal(idx.match("666.111.333-80", "Fernando Aguiar Neto"), undefined); // mesmo nome, CPF diferente
});

test("Crédito: aprova o bom pagador, recusa o de alto risco, detecta CPF inválido", async () => {
  const doc = (n: string) => ({ name: n, mime: "text/plain", data: demo(n) });
  const maria = await analyzeCredit({ applicant: "Maria Aparecida Souza", document: "123.456.789-09", requested: 15000, months: 24, monthlyRate: 0.025 }, [doc("holerite_maria.txt"), doc("extrato_maria.csv")]);
  assert.equal(maria.decision, "APROVAR");
  const joao = await analyzeCredit({ applicant: "João Pereira", document: "111.222.333-44", requested: 20000, months: 12, monthlyRate: 0.03 }, [doc("holerite_joao.txt"), doc("extrato_joao.csv")]);
  assert.equal(joao.decision, "RECUSAR");
  assert.ok(joao.flags.some((f) => f.texto.includes("inválido")));
});

test("Legado: COBOL convertido com regras e estrutura corretas", async () => {
  const r = await analyzeLegacy("CALCJUROS.cbl", demo("CALCJUROS.cbl").toString(), "TypeScript");
  assert.equal(r.language, "COBOL");
  assert.equal(r.rules.length, 7);
  assert.match(r.modernCode, /export function calcEncargos\(d: Dados\)/);
  assert.equal((r.modernCode.match(/\{/g) ?? []).length, (r.modernCode.match(/\}/g) ?? []).length);
});

test("Segurança: política de senha, configurações e hash da auditoria", () => {
  assert.ok(passwordProblem("curta1"));
  assert.ok(passwordProblem("senha123456789"));
  assert.equal(passwordProblem("Cooperativa2026Forte"), null);
  assert.equal(validateSettings(DEFAULTS), null);
  assert.ok(validateSettings({ ...DEFAULTS, collection: { ...DEFAULTS.collection, multa: 0.05 } }));
  assert.ok(validateSettings({ ...DEFAULTS, pld: { ...DEFAULTS.pld, analysisDays: 60 } }));
  const base = { prevHash: "GENESIS", orgId: "o", userId: "u", action: "login", detail: null, ip: null, createdAt: new Date(0) };
  assert.notEqual(auditHash(base), auditHash({ ...base, detail: "alterado" }));
});

test("Cobrança: saldo do acordo, excedente do Pix e tolerância de centavos", () => {
  assert.deepEqual(decidePayment(100, 0, 40, "strict"), { kind: "apply", paid: 40, settled: false, overpaid: 0 });
  assert.deepEqual(decidePayment(100, 0, 99.99, "strict"), { kind: "apply", paid: 99.99, settled: true, overpaid: 0 });
  assert.deepEqual(decidePayment(100, 90, 20, "accept_excess"), { kind: "apply", paid: 110, settled: true, overpaid: 10 });
  assert.deepEqual(decidePayment(100, 90, 20, "strict"), { kind: "reject_overpaid", remaining: 10 });
  assert.equal(decidePayment(100, 90, 10.01, "strict").kind, "apply");
  assert.deepEqual(decidePayment(100, 100, 50, "accept_excess"), { kind: "apply", paid: 150, settled: true, overpaid: 50 });
  assert.deepEqual(decidePayment(0.3, 0.1, 0.2, "strict"), { kind: "apply", paid: 0.3, settled: true, overpaid: 0 });
});

test("Tour público: dados determinísticos e coerentes com os arquivos de exemplo", () => {
  const a = buildTourData();
  assert.deepEqual(a, buildTourData());
  const c = a.conciliacao;
  assert.equal(c.format, "CNAB400");
  const s = c.summary;
  // Mesmos 13 itens do teste CNAB 400; as opções do tour só podem mover itens para "conciliado"
  assert.equal(s.matched + s.divergent + s.missing + s.unexpected, 13);
  assert.ok(s.matched >= 7);
  assert.equal(c.items.length, 13);
  assert.equal(a.cobranca.debts.length, 12);
  assert.ok(a.cobranca.debts.every((d) => d.options.length > 0 && d.multa <= d.principal * 0.02 + 0.01));
  assert.ok(a.pld.alertCount >= 1);
  assert.ok(a.pld.clients.some((x) => x.alerts.length > 0));
});

test("Tour público: sem banco, sessão nem server actions", () => {
  for (const f of ["../src/lib/tour.ts", "../src/app/tour/page.tsx"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    for (const bad of ["@/lib/db", "requireSession", "cookies(", "use server"]) assert.ok(!src.includes(bad), `${f} contém ${bad}`);
  }
});

test("Rotas públicas: /tour liberado, demais rotas protegidas", () => {
  assert.ok(isPublic("/tour"));
  assert.ok(isPublic("/tour/x"));
  assert.ok(!isPublic("/tourx"));
  assert.ok(!isPublic("/dashboard"));
  assert.ok(!isPublic("/api/x"));
});
