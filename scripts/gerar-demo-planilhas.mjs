// Gera as planilhas de exemplo da conciliação (public/demo). Determinístico: sem data atual nem aleatoriedade,
// e o ZIP do .xlsx não grava data/hora. Rodar duas vezes dá os mesmos bytes (o teste confere pelo SHA-256).
// Só escreve os arquivos listados em gerarPlanilhas().
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { buildXlsx } from "./xlsx-mini.mjs";

const serial = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);

// Mesmos títulos de titulos_esperados.csv, em outro layout: vírgula, aspas, ponto decimal e datas ISO
const titulos = [
  ["10000101", "Padaria Pão Quente Ltda", "1250.00", "2026-10-05"],
  ["10000102", "Mercado Bom Preço ME", "3480.50", "2026-10-05"],
  ["10000103", "Oficina Dois Irmãos", "890.00", "2026-10-06"],
  ["10000104", "Clínica Vida Saudável", "5200.00", "2026-10-07"],
  ["10000105", "Auto Peças Central", "2310.75", "2026-10-07"],
  ["10000106", "Escola Pequeno Saber", "4100.00", "2026-10-08"],
  ["10000107", "Farmácia Popular do Bairro", "1675.30", "2026-10-08"],
  ["10000108", "Restaurante Sabor Caseiro", "980.00", "2026-10-09"],
  ["10000109", "Construtora Alicerce", "12500.00", "2026-10-09"],
  ["10000110", "Pet Shop Amigo Fiel", "640.00", "2026-10-10"],
  ["10000111", "Academia Corpo em Forma", "1890.00", "2026-10-10"],
  ["10000112", "Gráfica Rápida Express", "735.90", "2026-10-11"],
];

// ---------- Cooperativa de crédito (outubro/2026): 50 títulos e o extrato do mês ----------

const COOPERADOS = [
  "Maria Aparecida Souza", "José Carlos Pereira", "Ana Paula Ferreira", "Antônio Marcos Lima", "Francisca Oliveira Santos",
  "João Batista Rodrigues", "Luciana Alves Costa", "Paulo Roberto Gomes", "Sebastiana Ribeiro", "Marcos Vinícius Martins",
  "Rita de Cássia Carvalho", "Pedro Henrique Araújo", "Sandra Regina Melo", "Raimundo Nonato Barbosa", "Cláudia Cristina Rocha",
  "Francisco das Chagas Dias", "Juliana Teixeira", "Edson Luiz Moreira", "Vera Lúcia Cardoso", "Adriano Nascimento",
  "Mercearia Dona Benta Ltda", "Laticínios Serra Azul Ltda", "Transportes Rio Claro ME", "Agropecuária Santa Fé Ltda", "Padaria Trigo de Ouro ME",
  "Marlene Fátima Correia", "Geraldo Magela Pinto", "Terezinha de Jesus Freitas", "Luiz Fernando Castro", "Aparecida Mendes",
  "Roberto Carlos Monteiro", "Simone Batista Ramos", "Valdir Antunes", "Rosângela Duarte", "Wagner Fonseca",
  "Cooperativa Leite Bom (filial)", "Oficina Mecânica Irmãos Prado", "Distribuidora Vale do Sol Ltda", "Sítio Boa Esperança", "Farmácia Saúde & Vida ME",
  "Benedita Conceição", "Osmar Tavares", "Neide Aparecida Lopes", "Célio Vieira", "Elaine Cristina Brito",
  "Moacir Siqueira", "Joana D'Arc Pires", "Ivone Campos", "Gilberto Assis", "Lourdes Machado",
];

// Documentos fictícios com dígitos verificadores válidos (CPF para pessoas, CNPJ para empresas)
const dv = (nums, pesos) => {
  const r = nums.reduce((a, n, i) => a + n * pesos[i], 0) % 11;
  return r < 2 ? 0 : 11 - r;
};
function cpf(k) {
  const b = String(123_456_000 + k * 7_919).padStart(9, "0").slice(-9).split("").map(Number);
  const d1 = dv(b, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...b, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...b, d1, d2].join("");
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}
function cnpj(k) {
  const b = (String(12_345_678 + k * 104_729).padStart(8, "0").slice(-8) + "0001").split("").map(Number);
  const d1 = dv(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...b, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...b, d1, d2].join("");
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}
const empresa = (nome) => /Ltda|ME\b|Cooperativa|Oficina|Distribuidora|Farmácia|Sítio/.test(nome);
const iso = (dia) => new Date(Date.UTC(2026, 9, dia)).toISOString().slice(0, 10);
const br = (v) => v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+,)/g, ".");
const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/** Títulos da cooperativa: parcelas de empréstimo e cotas, com valores distintos. */
export const COOP = COOPERADOS.map((nome, i) => {
  const valor = Math.round((150 + ((i * 7_919) % 3_100) + ((i * 37) % 100) / 100) * 100) / 100;
  return { ref: String(40_101 + i), nome, doc: empresa(nome) ? cnpj(i) : cpf(i), valor, venc: iso(1 + ((i * 5) % 30)) };
});
if (new Set(COOP.map((t) => t.valor)).size !== COOP.length) throw new Error("valores repetidos nos títulos da cooperativa");

// Cenários (índices em COOP). O resto é pago no dia, com o valor exato.
export const CENARIOS = { tarifa002: 36, tarifa040: 37, atraso: 38, duplicado: 39, valorData: 40, naoPagos: [41, 42, 43, 44, 45] };
const mais = (s, d) => new Date(Date.parse(`${s}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

function extratoCooperativa() {
  const creditos = [];
  COOP.forEach((t, i) => {
    if (CENARIOS.naoPagos.includes(i)) return;
    const linha = { data: t.venc, hist: "LIQUIDACAO BOLETO", doc: t.ref, nome: t.nome, cpf: t.doc, valor: t.valor };
    if (i === CENARIOS.tarifa002) linha.valor = Math.round((t.valor - 0.02) * 100) / 100;
    if (i === CENARIOS.tarifa040) linha.valor = Math.round((t.valor - 0.4) * 100) / 100;
    if (i === CENARIOS.atraso) linha.data = mais(t.venc, 4);
    if (i === CENARIOS.valorData) Object.assign(linha, { data: mais(t.venc, 1), hist: "PIX RECEBIDO", doc: "" });
    creditos.push(linha);
    if (i === CENARIOS.duplicado) creditos.push({ ...linha, data: mais(t.venc, 2) });
  });
  creditos.push({ data: "2026-10-20", hist: "PIX RECEBIDO", doc: "E18236120202610201530", nome: "Josué Almeida", cpf: cpf(77), valor: 150 });
  const debitos = [
    { data: "2026-10-01", hist: "TARIFA PACOTE DE SERVICOS", doc: "TAR1001", nome: "", cpf: "", valor: -89.9 },
    { data: "2026-10-15", hist: "PAGAMENTO FORNECEDOR", doc: "PAG5521", nome: "Papelaria Central Ltda", cpf: cnpj(90), valor: -1_320 },
    { data: "2026-10-31", hist: "IOF", doc: "IOF1031", nome: "", cpf: "", valor: -12.47 },
  ];
  // Ordem do extrato: por data; no mesmo dia, na ordem em que foram listados
  const todas = [...creditos, ...debitos].map((l, k) => ({ l, k })).sort((a, b) => a.l.data.localeCompare(b.l.data) || a.k - b.k).map((x) => x.l);
  return buildXlsx([
    {
      name: "Extrato",
      rows: [
        ["Extrato de conta corrente - Cooperativa de Crédito Vale Verde - outubro/2026"],
        [],
        ["Data", "Histórico", "Documento", "Pagador", "CPF/CNPJ", "Valor"],
        ...todas.map((l) => [{ date: serial(l.data) }, l.hist, l.doc, l.nome, l.cpf, l.valor]),
      ],
    },
  ]);
}

/** Nome do arquivo → conteúdo. */
export function gerarPlanilhas() {
  return {
    "esperados_layout_alt.csv":
      ['"Nosso Número","Cliente","Vlr Pago","Dt Venc","Obs"', ...titulos.map(([r, p, v, d], i) => `${r},"${p}",${v},${d},"${i % 2 ? "Boleto, carteira 1" : "Boleto"}"`)].join("\r\n") + "\r\n",
    // Extrato em planilha: título na linha 1, cabeçalho na linha 3, datas seriais do Excel e débitos negativos
    "extrato_planilha.xlsx": buildXlsx([
      {
        name: "Extrato",
        rows: [
          ["Extrato de conta corrente - Banco Exemplo - outubro/2026"],
          [],
          ["Data", "Histórico", "Documento", "Valor"],
          [{ date: serial("2026-10-05") }, "Crédito boleto", "10000101", 1250],
          [{ date: serial("2026-10-05") }, "Tarifa de manutenção", "TAR001", -39.9],
          [{ date: serial("2026-10-06") }, "Crédito boleto", "10000102", 3480.5],
          [{ date: serial("2026-10-07") }, "Crédito boleto", "10000104", 5150],
          [{ date: serial("2026-10-08") }, "Pagamento fornecedor", "PAG778", -1200],
          [{ date: serial("2026-10-09") }, "Crédito boleto", "10000109", 12500],
          [{ date: serial("2026-10-10") }, "Pix recebido", "99999999", 300],
        ],
      },
    ]),
    // Planilha com nomes de coluna desconhecidos e linhas inválidas (teste de erro por linha)
    "esperados_ruim.csv": ["Codigo;Quantia;Quando", "A1;100,00;05/10/2026", "A2;abc;06/10/2026", "A3;-5,00;31/02/2026", ";;"].join("\r\n") + "\r\n",
    // Cooperativa: lista de esperados no CSV padrão (lido direto) e extrato em planilha (pede confirmar as colunas na 1ª vez)
    "esperados_cooperativa.csv":
      ["referencia;pagador;cpf_cnpj;valor;vencimento", ...COOP.map((t) => `${t.ref};${t.nome};${t.doc};${br(t.valor)};${dmy(t.venc)}`)].join("\r\n") + "\r\n",
    "extrato_cooperativa.xlsx": extratoCooperativa(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = new URL("../public/demo/", import.meta.url);
  for (const [name, data] of Object.entries(gerarPlanilhas())) writeFileSync(new URL(name, dir), data);
  console.log("Planilhas de exemplo geradas em public/demo");
}
