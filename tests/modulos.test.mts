// Testes automáticos dos módulos: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validCnpj, validCpf } from "../src/lib/validators";
import { DEFAULT_CNAB400, parseBankFile, parseExpectedCsv, reconcile, reconcileWith, summarize } from "../src/lib/reconcile";
import { buildOptions, crc16, decidePayment, fmt, nextInstallment, parseDebtsCsv, parseTxid, pixPayload, pixTxid, proposal, updateDebt } from "../src/lib/collection";
import { analyzeClient, buildDossier, groupByClient, parseTransactionsCsv, scoreOf } from "../src/lib/pld";
import { checkCollectionMessage, checkDossier, isLegacyShape } from "../src/lib/ai-guard";
import { tryClaudeJson, type AiCall } from "../src/lib/ai";
import { buildIndex, nameKey, parseList } from "../src/lib/lists";
import { analyzeCredit } from "../src/lib/credit";
import { analyzeLegacy } from "../src/lib/legacy";
import { LOGO } from "../src/lib/logo-geometria";
import { criarSorteio, intensidade, pontosDaGrade, proximoPulso } from "../src/lib/malha";
import { DEFAULTS, validateSettings } from "../src/lib/settings";
import { auditHash, passwordProblem } from "../src/lib/auth";
import { buildTourData } from "../src/lib/tour";
import { isPublic } from "../src/lib/public-routes";
import { decideIdempotency, generateKey, hasScope, hashKey, idempotencyFingerprint, parseBearer, safeEqualHex } from "../src/lib/api-keys";
import { validateReconciliationBody } from "../src/lib/api-payload";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const demo = (f: string) => readFileSync(new URL(`../public/demo/${f}`, import.meta.url));

// Nenhum teste chama a IA real: sem chave, pickAi() não devolve a função de rede; onde a IA entra, ela é falsa (injetada)
delete process.env.ANTHROPIC_API_KEY;

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

test("Logo: geometria única, sem imports, igual no icon.svg", () => {
  const src = readFileSync("src/lib/logo-geometria.ts", "utf8");
  assert.ok(!/^import /m.test(src));
  assert.equal(LOGO.pecaOuro.cor, "#e0b84a");
  assert.equal(LOGO.pecaVerde.cor, "#34b59a");
  assert.equal(LOGO.fundo.cor, "#0f766e");
  const icon = readFileSync("src/app/icon.svg", "utf8");
  assert.ok(icon.includes(LOGO.pecaOuro.d) && icon.includes(LOGO.pecaVerde.d));
});

test("Malha: pontos na grade de 44px, sorteio determinístico e pouco dourado", () => {
  const pts = pontosDaGrade(100, 100);
  assert.deepEqual([...new Set(pts.map((p) => p.x))], [0.5, 44.5, 88.5]);
  const a = criarSorteio(44);
  const b = criarSorteio(44);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
  const rng = criarSorteio(1);
  let ouro = 0;
  for (let i = 0; i < 1000; i++) if (proximoPulso(rng, pts)?.cor === "ouro") ouro++;
  assert.ok(ouro > 30 && ouro < 150, `dourado: ${ouro}`);
  assert.equal(intensidade(0, 100), 0);
  assert.equal(intensidade(100, 100), 0);
  assert.ok(intensidade(50, 100) <= 1);
  assert.ok(!/^import /m.test(readFileSync("src/lib/malha.ts", "utf8")));
});

test("API: geração de chave, hash, parseBearer e comparação segura", () => {
  const a = generateKey();
  const b = generateKey();
  assert.match(a.secret, /^fo_live_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
  assert.equal(a.secret.split("_")[2], a.prefix);
  assert.equal(a.hash, hashKey(a.secret));
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(a.secret, b.secret);
  assert.notEqual(a.hash, b.hash);
  assert.deepEqual(parseBearer(`Bearer ${a.secret}`), { secret: a.secret, prefix: a.prefix });
  assert.deepEqual(parseBearer(`bearer   ${a.secret}  `), { secret: a.secret, prefix: a.prefix });
  for (const bad of [null, undefined, "", "Bearer", "Bearer ", `Basic ${a.secret}`, a.secret, `Bearer ${a.secret}x`, `Bearer ${a.secret} extra`, "Bearer fo_live_ABCDEFGH_" + "a".repeat(43), "Bearer fo_test_abcdefgh_" + "a".repeat(43), "Bearer " + "x".repeat(500)])
    assert.equal(parseBearer(bad as string), null, String(bad));
  assert.ok(safeEqualHex(a.hash, a.hash));
  assert.ok(!safeEqualHex(a.hash, b.hash));
  assert.ok(!safeEqualHex(a.hash, a.hash.slice(2)));
  assert.ok(!safeEqualHex("zz", "zz"));
  assert.ok(!safeEqualHex("", "ab"));
  assert.ok(hasScope(["conciliacao:read"], "conciliacao:read"));
  assert.ok(!hasScope(["conciliacao:read"], "conciliacao:write"));
  assert.ok(!hasScope([], "pld:read"));
});

const isoDay = (d?: Date) => d!.toISOString().slice(0, 10);
const demoBody = () => {
  const expected = parseExpectedCsv(demo("titulos_esperados.csv").toString());
  return {
    nome: "Teste API",
    esperados: expected.map((e) => ({ referencia: e.reference, pagador: e.payer, valor: e.amount, vencimento: isoDay(e.dueAt) })),
    banco: { arquivo: { nome: "retorno_cnab400.ret", conteudoBase64: demo("retorno_cnab400.ret").toString("base64") } },
    opcoes: { toleranciaCentavos: 2, valorEData: true, toleranciaDias: 3 },
  };
};

test("API: corpo JSON dos dados de exemplo dá o mesmo resultado que o caminho CSV + CNAB", () => {
  const opts = { toleranciaCentavos: 2, casarPorValorData: true, toleranciaDias: 3 };
  const csv = parseExpectedCsv(demo("titulos_esperados.csv").toString());
  const bank = parseBankFile("r.ret", demo("retorno_cnab400.ret").toString(), DEFAULT_CNAB400);
  const expectedSummary = summarize(reconcileWith(csv, bank.entries, opts));

  const v = validateReconciliationBody(demoBody(), DEFAULT_CNAB400);
  assert.ok(v.ok, JSON.stringify(!v.ok && v.errors));
  assert.equal(v.value.bankFormat, "CNAB400");
  assert.deepEqual(v.value.options, opts);
  assert.deepEqual(summarize(reconcileWith(v.value.expected, v.value.entries, v.value.options)), expectedSummary);

  // Mesmos créditos enviados como lançamentos JSON
  const body = { ...demoBody(), banco: { lancamentos: bank.entries.map((e) => ({ referencia: e.reference, valor: e.amount, data: isoDay(e.paidAt) })) } };
  const j = validateReconciliationBody(body);
  assert.ok(j.ok);
  assert.equal(j.value.bankFormat, "JSON");
  assert.deepEqual(summarize(reconcileWith(j.value.expected, j.value.entries, j.value.options)), expectedSummary);
});

test("API: rejeições do corpo de conciliação", () => {
  const bad = (mut: (b: ReturnType<typeof demoBody> & Record<string, unknown>) => unknown, campo: RegExp) => {
    const b = demoBody() as ReturnType<typeof demoBody> & Record<string, unknown>;
    const r = validateReconciliationBody(mut(b) ?? b);
    assert.ok(!r.ok, `deveria rejeitar ${campo}`);
    assert.ok(r.errors.some((e) => campo.test(e.campo)), JSON.stringify(r.errors));
  };
  assert.ok(!validateReconciliationBody(null).ok);
  assert.ok(!validateReconciliationBody({}).ok);
  bad((b) => ({ ...b, esperados: [] }), /^esperados$/);
  bad((b) => ({ ...b, esperados: Array.from({ length: 20_001 }, () => b.esperados[0]) }), /^esperados$/);
  bad((b) => void (b.esperados[0].valor = -10), /esperados\[0\]\.valor/);
  bad((b) => void (b.esperados[1].valor = NaN), /esperados\[1\]\.valor/);
  bad((b) => void (b.esperados[0].valor = 10.001), /esperados\[0\]\.valor/);
  bad((b) => void (b.esperados[0].vencimento = "2026-02-30"), /esperados\[0\]\.vencimento/);
  bad((b) => void (b.esperados[0].vencimento = "05/10/2026"), /esperados\[0\]\.vencimento/);
  bad((b) => void (b.opcoes.toleranciaCentavos = 101), /opcoes\.toleranciaCentavos/);
  bad((b) => void (b.opcoes.toleranciaDias = -1), /opcoes\.toleranciaDias/);
  bad((b) => ({ ...b, banco: { ...b.banco, lancamentos: [{ valor: 1, data: "2026-10-05" }] } }), /^banco$/);
  bad((b) => ({ ...b, banco: {} }), /^banco$/);
  bad((b) => ({ ...b, banco: { lancamentos: [{ valor: 0, data: "2026-10-05" }] } }), /lancamentos\[0\]\.valor/);
});

test("API: fingerprint ignora a ordem das chaves e idempotência decide pelo registro", () => {
  assert.equal(idempotencyFingerprint({ a: 1, b: { c: [1, { x: 1, y: 2 }], d: "z" } }), idempotencyFingerprint({ b: { d: "z", c: [1, { y: 2, x: 1 }] }, a: 1 }));
  assert.notEqual(idempotencyFingerprint({ a: [1, 2] }), idempotencyFingerprint({ a: [2, 1] }));
  const now = new Date("2026-10-20T12:00:00Z");
  const fp = idempotencyFingerprint({ a: 1 });
  const at = (h: number) => new Date(now.getTime() - h * 3_600_000);
  assert.equal(decideIdempotency(null, fp, now), "novo");
  assert.equal(decideIdempotency({ fingerprint: fp, responseJson: { id: "x" }, createdAt: at(1) }, fp, now), "replay");
  assert.equal(decideIdempotency({ fingerprint: "outro", responseJson: { id: "x" }, createdAt: at(1) }, fp, now), "mismatch");
  assert.equal(decideIdempotency({ fingerprint: fp, responseJson: null, createdAt: at(0) }, fp, now), "em_andamento");
  assert.equal(decideIdempotency({ fingerprint: fp, responseJson: { id: "x" }, createdAt: at(25) }, fp, now), "expirado");
});

test("Rotas públicas: API v1 por módulo e documentação", () => {
  for (const p of ["/api/v1/conciliacoes", "/api/v1/conciliacoes/abc", "/docs/api"]) assert.ok(isPublic(p), p);
  for (const p of ["/api/v1", "/api/v1/", "/api/v1/outra", "/api/v1/conciliacoesX", "/docs/api/x", "/docs", "/api/conciliacao/1/csv"]) assert.ok(!isPublic(p), p);
});

test("API: toda rota em src/app/api/v1 passa por withApiKey", () => {
  const root = fileURLToPath(new URL("../src/app/api/v1", import.meta.url));
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f === "route.ts" ? [join(d, f)] : []));
  const files = walk(root);
  assert.ok(files.length >= 2);
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const handlers = src.match(/export (async )?function (GET|POST|PUT|PATCH|DELETE)\b/g) ?? [];
    assert.ok(handlers.length > 0, f);
    assert.equal((src.match(/withApiKey\(req,/g) ?? []).length, handlers.length, `${f}: cada handler deve usar withApiKey`);
  }
});

test("Conciliação: letras contam na referência (B1)", () => {
  const st = (e: string, b: string) => reconcileWith([{ reference: e, amount: 10 }], [{ reference: b, amount: 10 }]).map((i) => i.status);
  assert.ok(!st("ABC-1", "XYZ-1").includes("CONCILIADO"));
  assert.deepEqual(st("abc 1", "ABC-1"), ["CONCILIADO"]);
  assert.deepEqual(st("00012345", "12345"), ["CONCILIADO"]);
});

test("Conciliação: casamento exato vem antes do dígito verificador (B2)", () => {
  const banco = [{ reference: "123456", amount: 20 }];
  for (const esperados of [
    [{ reference: "12345", amount: 10 }, { reference: "123456", amount: 20 }],
    [{ reference: "123456", amount: 20 }, { reference: "12345", amount: 10 }],
  ]) {
    const r = Object.fromEntries(reconcileWith(esperados, banco).filter((i) => i.reference).map((i) => [i.reference, i.status]));
    assert.equal(r["123456"], "CONCILIADO");
    assert.equal(r["12345"], "PENDENTE");
  }
});

test("Cobrança: parcelas somam exatamente o total e a última nunca é recusada (B3)", () => {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (const o of buildOptions(10000, 10000, 400)) assert.equal(r2(o.installment * (o.installments - 1) + o.lastInstallment), o.total);
  assert.deepEqual(nextInstallment(6500, 6, 1083.33, 5416.65), { nth: 6, amount: 1083.35, remaining: 1083.35 });
  assert.deepEqual(nextInstallment(8950, 24, 372.92, 8577.16), { nth: 24, amount: 372.84, remaining: 372.84 });
  assert.equal(nextInstallment(8950, 24, 372.92, 0)?.amount, 372.92);
  assert.equal(nextInstallment(100, 3, 33.33, 100), null);
  for (const [total, n, parcela] of [[6500, 6, 1083.33], [8950, 24, 372.92], [6500.01, 3, 2166.67]] as const) {
    let paid = 0;
    let last;
    for (let k = 0; k < n; k++) {
      const due = nextInstallment(total, n, parcela, paid)!;
      last = decidePayment(total, paid, due.amount, "strict");
      assert.equal(last.kind, "apply");
      if (last.kind === "apply") paid = last.paid;
    }
    assert.ok(last && last.kind === "apply" && last.settled);
    assert.equal(nextInstallment(total, n, parcela, paid), null);
  }
});

test("PLD: cada débito justifica a saída uma única vez (B7)", () => {
  const tx = (h: number, direction: "C" | "D", amount: number) => ({
    date: new Date(Date.UTC(2026, 9, 1, h)), clientDoc: "1", clientName: "Teste", pep: false, type: "PIX", direction, amount,
  });
  const regra = (txs: ReturnType<typeof tx>[]) => analyzeClient(txs).find((a) => a.rule === "PASSAGEM_RAPIDA");
  assert.equal(regra([tx(9, "C", 10_000), tx(10, "C", 10_000), tx(12, "D", 9_000)]), undefined);
  const a = regra([tx(9, "C", 10_000), tx(10, "C", 10_000), tx(12, "D", 9_000), tx(13, "D", 9_000)]);
  assert.ok(a && a.description.includes("2 crédito(s)") && /R\$\s18\.000,00/.test(a.description));
});

// ---- Proteção do uso de IA (Etapa 1) ----

const fakeAi = (data: unknown): AiCall => (async () => ({ ok: true, data })) as AiCall;
const failingAi: AiCall = (async () => ({ ok: false, reason: "http", detail: "HTTP 500: erro simulado" })) as AiCall;
const NOW = new Date(Date.UTC(2026, 9, 20, 12));
const DEBT = { debtor: "Carlos Mendes", contract: "CT-2024-0042", product: "Cartão", principal: 5000, dueDate: new Date(Date.UTC(2026, 6, 1)) };
const LINK = "https://app.exemplo.com.br/acordo/tok123456789abcdef";

test("IA cobrança: conferência aprova a base, aceita NBSP e reprova faltas, URL extra e vazio", async () => {
  const p = await proposal(DEBT, LINK, DEFAULTS.collection, "Banco Teste", { now: NOW });
  assert.equal(p.aiStatus, "desligada");
  assert.equal(p.message, p.messageBase);
  const best = p.options[0];
  const parc = p.options[p.options.length - 1];
  const ref = { values: { cashTotal: best.total, discountPct: best.discountPct, installments: parc.installments, installment: parc.installment }, contract: DEBT.contract, link: LINK };
  assert.deepEqual(checkCollectionMessage(p.messageBase, ref), { ok: true, missing: [] });
  assert.ok(checkCollectionMessage(p.messageBase.replace(/ /g, " "), ref).ok);
  const semValor = checkCollectionMessage(p.messageBase.split(fmt(best.total)).join("um valor"), ref);
  assert.ok(!semValor.ok && semValor.missing.includes(fmt(best.total)));
  assert.deepEqual(checkCollectionMessage(p.messageBase.replace(DEBT.contract, "seu contrato"), ref).missing, [DEBT.contract]);
  assert.deepEqual(checkCollectionMessage(p.messageBase.replace(LINK, "o nosso site"), ref).missing, [LINK]);
  const evil = checkCollectionMessage(`${p.messageBase}\nOu acesse https://evil.example/pagar`, ref);
  assert.ok(!evil.ok && evil.missing.some((m) => m.includes("evil.example")));
  assert.ok(!checkCollectionMessage("   ", ref).ok);
  assert.ok(!checkCollectionMessage("x".repeat(1001), ref).ok);
  // Desconto zero não exige percentual; uma opção só não exige parcela
  assert.ok(checkCollectionMessage(`Contrato ${DEBT.contract}: ${fmt(100)} em ${LINK}`, { values: { cashTotal: 100, discountPct: 0 }, contract: DEBT.contract, link: LINK }).ok);
});

test("IA cobrança: proposal com IA falsa — usada, rejeitada (sem link) e falha sem lançar", async () => {
  const base = (await proposal(DEBT, LINK, DEFAULTS.collection, "Banco Teste", { now: NOW })).messageBase;
  const boa = `Oi, Carlos! ${base}`;
  const ok = await proposal(DEBT, LINK, DEFAULTS.collection, "Banco Teste", { now: NOW, call: fakeAi({ message: boa }) });
  assert.equal(ok.aiStatus, "usada");
  assert.equal(ok.message, boa);
  assert.equal(ok.messageBase, base);
  const rej = await proposal(DEBT, LINK, DEFAULTS.collection, "Banco Teste", { now: NOW, call: fakeAi({ message: base.replace(LINK, "") }) });
  assert.equal(rej.aiStatus, "rejeitada");
  assert.equal(rej.message, rej.messageBase);
  assert.ok(rej.missing.includes(LINK));
  const f = await proposal(DEBT, LINK, DEFAULTS.collection, "Banco Teste", { now: NOW, call: failingAi });
  assert.equal(f.aiStatus, "falhou");
  assert.equal(f.message, f.messageBase);
  assert.ok(f.aiDetail?.startsWith("http"));
});

function dossierCase() {
  const txs = parseTransactionsCsv(demo("transacoes_pld.csv").toString());
  const list = [...groupByClient(txs).values()].find((l) => l[0].clientName.startsWith("Comercial"))!;
  const alerts = analyzeClient(list, DEFAULTS.pld);
  const times = list.map((t) => t.date.getTime());
  const sum = (dir: "C" | "D") => list.filter((t) => t.direction === dir).reduce((a, t) => a + t.amount, 0);
  return {
    clientName: list[0].clientName,
    clientDoc: list[0].clientDoc,
    declaredIncome: list[0].income,
    pep: list[0].pep,
    periodStart: new Date(Math.min(...times)),
    periodEnd: new Date(Math.max(...times)),
    totalIn: sum("C"),
    totalOut: sum("D"),
    alerts,
    score: scoreOf(alerts).score,
  };
}

test("IA PLD: dossiê confere contra si mesmo e reprova sem valor, data ou norma", async () => {
  const c = dossierCase();
  const d = await buildDossier(c, { useAi: false });
  assert.equal(d.aiStatus, "desligada");
  assert.equal(d.text, d.base);
  assert.deepEqual(checkDossier(d.base, d.base), { ok: true, missing: [] });
  const valor = d.base.match(/R\$\s?[\d.]+,\d{2}/)![0];
  assert.ok(checkDossier(d.base.split(valor).join("[valor]"), d.base).missing.includes(valor.replace(/\s/, "")));
  const data = d.base.match(/\d{2}\/\d{2}\/\d{4}/)![0];
  assert.ok(checkDossier(d.base.split(data).join("[data]"), d.base).missing.includes(data));
  assert.ok(checkDossier(d.base.split("Lei 9.613/1998").join("lei de lavagem"), d.base).missing.includes("Lei 9.613/1998"));
  assert.ok(checkDossier(d.base.split(`${c.score}/100`).join("alta"), d.base).missing.includes(`${c.score}/100`));
});

test("IA PLD e crédito: IA falhando não lança e cai no texto determinístico", async () => {
  const d = await buildDossier(dossierCase(), { call: failingAi });
  assert.equal(d.aiStatus, "falhou");
  assert.equal(d.text, d.base);
  assert.equal(d.aiText, undefined);
  const rej = await buildDossier(dossierCase(), { call: fakeAi({ text: "Dossiê resumido sem fatos." }) });
  assert.equal(rej.aiStatus, "rejeitada");
  assert.equal(rej.text, rej.base);

  const doc = (n: string) => ({ name: n, mime: "text/plain", data: demo(n) });
  const input = { applicant: "Maria Aparecida Souza", document: "123.456.789-09", requested: 15000, months: 24, monthlyRate: 0.025 };
  const files = [doc("holerite_maria.txt"), doc("extrato_maria.csv")];
  const local = await analyzeCredit(input, files);
  const r = await analyzeCredit(input, files, undefined, { call: failingAi });
  assert.equal(r.aiStatus, "falhou");
  assert.equal(r.provider, "demo-fallback");
  assert.equal(r.decision, local.decision);
  assert.equal(r.opinion, r.opinionBase);
  const longo = await analyzeCredit(input, files, undefined, { call: fakeAi({ rendaMensal: 6181.27, flags: [], parecer: "x".repeat(2001) }) });
  assert.equal(longo.aiStatus, "rejeitada");
  assert.equal(longo.opinion, longo.opinionBase);
});

test("IA legado: forma da resposta conferida e forma inválida cai no determinístico", async () => {
  assert.ok(isLegacyShape({ summary: "Resumo", modernCode: "", rules: [{ onde: "A", regra: "B" }] }));
  assert.ok(!isLegacyShape({ summary: "", modernCode: "", rules: [] }));
  assert.ok(!isLegacyShape({ summary: "ok", modernCode: 1, rules: [] }));
  assert.ok(!isLegacyShape({ summary: "ok", modernCode: "", rules: [{ onde: "A" }] }));
  assert.ok(!isLegacyShape({ summary: "ok", modernCode: "", rules: Array.from({ length: 501 }, () => ({ onde: "a", regra: "b" })) }));
  // Imita o tryClaudeJson real: validate reprova a forma e devolve reason "forma"
  const shapeAi = (async (_s: string, _p: string, _f?: unknown, o?: { validate?: (x: unknown) => boolean }) =>
    o?.validate?.({ summary: 42 }) === false ? { ok: false, reason: "forma", detail: "forma" } : { ok: true, data: {} }) as unknown as AiCall;
  const r = await analyzeLegacy("CALCJUROS.cbl", demo("CALCJUROS.cbl").toString(), "TypeScript", { call: shapeAi });
  assert.equal(r.aiStatus, "rejeitada");
  assert.equal(r.rules.length, 7);
  assert.match(r.modernCode, /export function calcEncargos\(d: Dados\)/);
});

test("IA: tryClaudeJson nunca lança (500, corpo não JSON, timeout, forma, sem chave)", async () => {
  const realFetch = globalThis.fetch;
  try {
    const semChave = await tryClaudeJson("s", "p");
    assert.ok(!semChave.ok && semChave.reason === "sem_chave"); // nem chega na rede
    process.env.ANTHROPIC_API_KEY = "sk-ant-teste-falso";
    globalThis.fetch = (async () => new Response("erro interno sk-ant-teste-falso", { status: 500 })) as typeof fetch;
    const e500 = await tryClaudeJson("s", "p");
    assert.ok(!e500.ok && e500.reason === "http" && !e500.detail.includes("sk-ant-teste-falso"));
    globalThis.fetch = (async () => new Response("<html>não é json</html>", { status: 200 })) as typeof fetch;
    const nj = await tryClaudeJson("s", "p");
    assert.ok(!nj.ok && nj.reason === "json");
    globalThis.fetch = (async () => new Response(JSON.stringify({ content: [{ type: "text", text: "sem objeto" }] }), { status: 200 })) as typeof fetch;
    const tj = await tryClaudeJson("s", "p");
    assert.ok(!tj.ok && tj.reason === "json");
    globalThis.fetch = ((_u: unknown, init?: RequestInit) =>
      new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as typeof fetch;
    const to = await tryClaudeJson("s", "p", [], { timeoutMs: 30 });
    assert.ok(!to.ok && to.reason === "timeout");
    globalThis.fetch = (async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"x":1}' }] }), { status: 200 })) as typeof fetch;
    const forma = await tryClaudeJson("s", "p", [], { validate: (x): x is { message: string } => typeof (x as { message?: unknown }).message === "string" });
    assert.ok(!forma.ok && forma.reason === "forma");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
});
