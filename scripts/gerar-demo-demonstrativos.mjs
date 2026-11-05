// Gera DRE + balanço fictícios (jan–mar/2026) em PDF mínimo e o CSV com os valores corretos. Sem dependências e determinístico.
// Uso: node scripts/gerar-demo-demonstrativos.mjs
// O _02 vem em "R$ mil"; o _03 tem um erro proposital no lucro bruto (178.600 impresso; o correto é 176.800).
import { writeFileSync } from "node:fs";

const EMPRESA = "Comercial Exemplo Ltda. (dados fictícios)";

// Valores corretos em reais.
const MESES = {
  "2026-01": { receita_bruta: 500000, deducoes: 75000, receita_liquida: 425000, cmv: 255000, lucro_bruto: 170000, despesas_operacionais: 85000, ebitda: 85000, depreciacao: 10000, ebit: 75000, resultado_financeiro: -5000, lair: 70000, ir_csll: 23800, lucro_liquido: 46200, ativo_total: 1200000, passivo_circulante: 300000, patrimonio_liquido: 600000, emprestimos: 250000, caixa: 100000 },
  "2026-02": { receita_bruta: 540000, deducoes: 81000, receita_liquida: 459000, cmv: 275000, lucro_bruto: 184000, despesas_operacionais: 88000, ebitda: 96000, depreciacao: 10000, ebit: 86000, resultado_financeiro: -4000, lair: 82000, ir_csll: 28000, lucro_liquido: 54000, ativo_total: 1250000, passivo_circulante: 310000, patrimonio_liquido: 654000, emprestimos: 240000, caixa: 115000 },
  "2026-03": { receita_bruta: 520000, deducoes: 78000, receita_liquida: 442000, cmv: 265200, lucro_bruto: 176800, despesas_operacionais: 86000, ebitda: 90800, depreciacao: 10000, ebit: 80800, resultado_financeiro: -4800, lair: 76000, ir_csll: 25840, lucro_liquido: 50160, ativo_total: 1290000, passivo_circulante: 305000, patrimonio_liquido: 704160, emprestimos: 230000, caixa: 130000 },
};

const DRE = [
  ["Receita bruta", "receita_bruta", 1],
  ["(-) Deduções da receita", "deducoes", -1],
  ["Receita líquida", "receita_liquida", 1],
  ["(-) Custo das mercadorias vendidas", "cmv", -1],
  ["Lucro bruto", "lucro_bruto", 1],
  ["(-) Despesas operacionais", "despesas_operacionais", -1],
  ["EBITDA", "ebitda", 1],
  ["(-) Depreciação e amortização", "depreciacao", -1],
  ["Resultado operacional (EBIT)", "ebit", 1],
  ["Resultado financeiro", "resultado_financeiro", 1],
  ["Lucro antes do IR e CSLL", "lair", 1],
  ["(-) IR e CSLL", "ir_csll", -1],
  ["Lucro líquido do período", "lucro_liquido", 1],
];
const BAL = [
  ["Ativo total", "ativo_total"],
  ["Caixa e equivalentes", "caixa"],
  ["Passivo circulante", "passivo_circulante"],
  ["Empréstimos e financiamentos", "emprestimos"],
  ["Patrimônio líquido", "patrimonio_liquido"],
];

const fmt = (v, dec) => {
  const s = Math.abs(v).toFixed(dec).split(".");
  const int = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const t = dec ? `${int},${s[1]}` : int;
  return v < 0 ? `(${t})` : t;
};

const pdfEsc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** PDF de uma página: linhas [x, y, texto, tamanho, negrito?]. Texto em WinAnsi (latin1). */
function pdf(linhas) {
  const conteudo = linhas.map(([x, y, t, sz, b]) => `BT /${b ? "F2" : "F1"} ${sz} Tf ${x} ${y} Td (${pdfEsc(t)}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(conteudo, "latin1")} >>\nstream\n${conteudo}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const NOMES = { "01": "janeiro", "02": "fevereiro", "03": "março" };

for (const [chave, v] of Object.entries(MESES)) {
  const mes = chave.slice(5);
  const mil = mes === "02";
  const impresso = { ...v };
  if (mes === "03") impresso.lucro_bruto = 178600; // erro proposital (dígitos trocados)
  const val = (k) => {
    const x = mil ? impresso[k] / 1000 : impresso[k];
    return fmt(x, mil ? 0 : 2);
  };
  const L = [];
  let y = 790;
  L.push([50, y, EMPRESA, 13, true]);
  L.push([50, (y -= 18), `Demonstração do Resultado e Balanço Patrimonial - ${NOMES[mes]} de 2026`, 11, false]);
  L.push([50, (y -= 16), `Valores em ${mil ? "R$ mil" : "R$"}`, 10, false]);
  L.push([50, (y -= 30), "DEMONSTRAÇÃO DO RESULTADO (DRE)", 11, true]);
  y -= 6;
  for (const [rot, k] of DRE) L.push([50, (y -= 18), rot, 10, false], [420, y, val(k), 10, false]);
  L.push([50, (y -= 34), "BALANÇO PATRIMONIAL (saldo final do mês)", 11, true]);
  y -= 6;
  for (const [rot, k] of BAL) L.push([50, (y -= 18), rot, 10, false], [420, y, val(k), 10, false]);
  L.push([50, (y -= 40), "Documento fictício para demonstração. Não corresponde a nenhuma empresa real.", 8, false]);
  writeFileSync(new URL(`../public/demo/dre_balanco_2026_${mes}.pdf`, import.meta.url), pdf(L));
}

const chaves = Object.keys(MESES["2026-01"]);
const csv = [`linha;${Object.keys(MESES).join(";")}`, ...chaves.map((k) => `${k};${Object.values(MESES).map((m) => m[k].toFixed(2)).join(";")}`)].join("\n") + "\n";
writeFileSync(new URL("../public/demo/demonstrativos_2026_esperado.csv", import.meta.url), csv);
console.log("Gerados: dre_balanco_2026_01.pdf, _02.pdf, _03.pdf e demonstrativos_2026_esperado.csv em public/demo/");

// ---------- P&L do QuickBooks (fictício, em dólar): public/demo/quickbooks_pl_2026_09.pdf + _esperado.json ----------
// "Harbor & Pine Law LLC" e todos os valores são inventados. Layout do relatório "Profit & Loss" mensal do QuickBooks:
// 2 páginas, o grupo de Other Expense atravessa a quebra; "Accrual Basis", cabeçalho "September 2026", coluna "Sep 26".

const QB_EMPRESA = "Harbor & Pine Law LLC";
// [nome, centavos] para folha; [nome, [...filhas]] para grupo. Seções na ordem do relatório.
const QB = [
  ["Income", [
    ["Legal Fees", [["Hourly Billing", 14825000], ["Flat Fee Matters", 3640000], ["Contingency Fees", 2275000]]],
    ["Reimbursed Expenses", 318050],
    ["Refunds to Clients", -125000],
  ]],
  ["Cost of Goods Sold", [
    ["Contract Attorneys", [["Of Counsel", 1850000], ["Paralegal Contractors", 924000]]],
    ["Court Filing Fees", 431575],
    ["Expert Witness Fees", 680000],
  ]],
  ["Expenses", [
    ["Advertising & Marketing", 425000],
    ["Automobile Expense", [["Fuel", 61240], ["Parking", 38500]]],
    ["Bank Service Charges", 14500],
    ["Continuing Education", 120000],
    ["Dues & Subscriptions", 89000],
    ["Insurance Expense", 342000],
    ["Meals 100%", 74230],
    ["Meals 50%", 118460],
    ["Merchant Account Fees", 209331],
    ["Office Supplies", 103685],
    ["Payroll Expenses", [["Payroll Fee", 41000], ["Payroll Tax", 687215], ["Wages", 7850000]]],
    ["Postage and Delivery", 28640],
    ["Professional Fees", 350000],
    ["Rent Expense", 1200000],
    ["Software Subscriptions", 214500],
    ["Telephone & Internet", 96820],
    ["Travel Expense", 174000],
    ["Utilities", 112500],
  ]],
  ["Other Expense", [
    ["Ask My Accountant", [["Uncategorized Card Charges", 134218], ["Unmatched Transfers", 56000], ["Owner Draw Pending Review", 210000]]],
    ["Shareholder Distributions", 6000000],
  ]],
];

const usd = (c, cifrao) => {
  const s = (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${c < 0 ? "-" : ""}${cifrao ? "$" : ""}${s}`;
};
const soma = (itens) => itens.reduce((t, [, v]) => t + (Array.isArray(v) ? soma(v) : v), 0);
const normQ = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const SEC = { "Income": "income", "Cost of Goods Sold": "cogs", "Expenses": "expense", "Other Expense": "other_expense" };

const linhasQb = []; // [nivel, rotulo, centavos|null, cifrao?]
const contasEsperadas = {};
function emitir(itens, nivel, sec, cam) {
  for (const [nome, v] of itens) {
    const c = [...cam, normQ(nome)];
    if (Array.isArray(v)) {
      linhasQb.push([nivel, nome, null]);
      emitir(v, nivel + 1, sec, c);
      linhasQb.push([nivel, `Total ${nome}`, soma(v)]);
      contasEsperadas[[sec, ...c].join(" > ")] = soma(v) / 100;
    } else {
      linhasQb.push([nivel, nome, v]);
      contasEsperadas[[sec, ...c].join(" > ")] = v / 100;
    }
  }
}
const tot = Object.fromEntries(QB.map(([s, it]) => [SEC[s], soma(it)]));
const gross = tot.income - tot.cogs, netOrd = gross - tot.expense, netOther = -tot.other_expense, netInc = netOrd + netOther;
linhasQb.push([0, "Ordinary Income/Expense", null]);
for (const [s, itens] of QB) {
  if (s === "Other Expense") {
    linhasQb.push([0, "Net Ordinary Income", netOrd, true]);
    linhasQb.push([0, "Other Income/Expense", null]);
  }
  linhasQb.push([1, s, null]);
  emitir(itens, 2, SEC[s], []);
  linhasQb.push([1, `Total ${s}`, tot[SEC[s]], true]);
  if (s === "Cost of Goods Sold") linhasQb.push([0, "Gross Profit", gross, true]);
}
linhasQb.push([0, "Net Other Income", netOther, true]);
linhasQb.push([0, "Net Income", netInc, true]);

/** PDF de várias páginas (mesmo formato do pdf() acima, que fica intacto para os PDFs BR). */
function pdfPaginas(paginas) {
  const n = paginas.length;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${paginas.map((_, i) => `${5 + 2 * i} 0 R`).join(" ")}] /Count ${n} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  paginas.forEach((linhas, i) => {
    const conteudo = linhas.map(([x, y, t, sz, b]) => `BT /${b ? "F2" : "F1"} ${sz} Tf ${x} ${y} Td (${pdfEsc(t)}) Tj ET`).join("\n");
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`);
    objs.push(`<< /Length ${Buffer.byteLength(conteudo, "latin1")} >>\nstream\n${conteudo}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// Quebra no meio do grupo "Ask My Accountant" (depois da 2ª subconta).
const quebra = linhasQb.findIndex(([, r]) => r === "Unmatched Transfers") + 1;
const blocos = [linhasQb.slice(0, quebra), linhasQb.slice(quebra)];
const paginasQb = blocos.map((bloco, p) => {
  const L = [];
  // Cabeçalho do QuickBooks: hora/data/base à esquerda, empresa/título/período ao centro, rótulo da coluna.
  L.push([36, 750, "10:42 AM", 8, true], [230, 750, QB_EMPRESA, 12, true]);
  L.push([36, 738, "10/06/26", 8, true], [262, 734, "Profit & Loss", 14, true]);
  L.push([36, 726, "Accrual Basis", 8, true], [262, 718, "September 2026", 10, true]);
  L.push([500, 696, "Sep 26", 9, true]);
  let y = 680;
  for (const [nivel, rot, v, cifrao] of bloco) {
    y -= 12.5;
    const negrito = v === null || rot.startsWith("Total ") || nivel === 0;
    L.push([36 + nivel * 10, y, rot, 8, negrito]);
    if (v !== null) L.push([480, y, usd(v, cifrao), 8, negrito]);
  }
  L.push([280, 30, `Page ${p + 1} of ${blocos.length}`, 8, false]);
  return L;
});
writeFileSync(new URL("../public/demo/quickbooks_pl_2026_09.pdf", import.meta.url), pdfPaginas(paginasQb));

const esperadoQb = {
  aviso: "Dados fictícios para demonstração. Não corresponde a nenhuma empresa real.",
  empresa: QB_EMPRESA,
  ano: 2026,
  mes: 9,
  moeda: "USD",
  secoes: Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, v / 100])),
  resumo: { gross_profit: gross / 100, net_ordinary: netOrd / 100, net_other: netOther / 100, net_income: netInc / 100 },
  contas: contasEsperadas,
};
writeFileSync(new URL("../public/demo/quickbooks_pl_2026_09_esperado.json", import.meta.url), JSON.stringify(esperadoQb, null, 2) + "\n");
console.log("Gerados: quickbooks_pl_2026_09.pdf e quickbooks_pl_2026_09_esperado.json em public/demo/");
