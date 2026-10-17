// Gera os arquivos fictícios de demonstração em public/demo
import { mkdirSync, writeFileSync } from "node:fs";

const dir = new URL("../public/demo/", import.meta.url);
mkdirSync(dir, { recursive: true });
const save = (name, text) => writeFileSync(new URL(name, dir), text);

const titulos = [
  ["10000101", "Padaria Pão Quente Ltda", 1250.0, "05/10/2026"],
  ["10000102", "Mercado Bom Preço ME", 3480.5, "05/10/2026"],
  ["10000103", "Oficina Dois Irmãos", 890.0, "06/10/2026"],
  ["10000104", "Clínica Vida Saudável", 5200.0, "07/10/2026"],
  ["10000105", "Auto Peças Central", 2310.75, "07/10/2026"],
  ["10000106", "Escola Pequeno Saber", 4100.0, "08/10/2026"],
  ["10000107", "Farmácia Popular do Bairro", 1675.3, "08/10/2026"],
  ["10000108", "Restaurante Sabor Caseiro", 980.0, "09/10/2026"],
  ["10000109", "Construtora Alicerce", 12500.0, "09/10/2026"],
  ["10000110", "Pet Shop Amigo Fiel", 640.0, "10/10/2026"],
  ["10000111", "Academia Corpo em Forma", 1890.0, "10/10/2026"],
  ["10000112", "Gráfica Rápida Express", 735.9, "11/10/2026"],
];
const brl = (n) => n.toFixed(2).replace(".", ",");
save(
  "titulos_esperados.csv",
  ["referencia;pagador;valor;vencimento", ...titulos.map(([r, p, v, d]) => `${r};${p};${brl(v)};${d}`)].join("\r\n") + "\r\n",
);

// Pagamentos no retorno: [nosso número, valor pago, data DDMMAA]
const pagos = [
  ["10000101", 1250.0, "051026"],
  ["10000102", 3480.5, "051026"],
  ["10000103", 912.25, "081026"], // pago com juros/multa
  ["10000104", 5200.0, "071026"],
  ["10000105", 2310.75, "071026"],
  ["10000106", 3895.0, "081026"], // pago com desconto
  ["10000107", 1675.3, "081026"],
  ["10000109", 12500.0, "091026"],
  ["10000110", 640.0, "101026"],
  ["10000199", 450.0, "111026"], // título não cadastrado
];
const pad = (s, n, c = " ", left = false) => (left ? String(s).padStart(n, c) : String(s).padEnd(n, c)).slice(0, n);
const header = pad("02RETORNO01COBRANCA       0001234567890000000COOPERATIVA DEMO", 394) + pad("1", 6, "0", true);
const detalhes = pagos.map(([nn, v, d], i) => {
  const l = Array(400).fill(" ");
  const put = (pos, s) => [...s].forEach((ch, k) => (l[pos - 1 + k] = ch));
  put(1, "1");
  put(63, nn);
  put(109, "06");
  put(111, d);
  put(153, pad(Math.round(v * 100), 13, "0", true));
  put(254, pad(Math.round(v * 100), 13, "0", true));
  put(395, pad(i + 2, 6, "0", true));
  return l.join("");
});
const trailer = pad("9", 394) + pad(pagos.length + 2, 6, "0", true);
save("retorno_cnab400.ret", [header, ...detalhes, trailer].join("\r\n") + "\r\n");

// Extrato OFX com créditos de boletos e Pix
const ofxTx = [
  ["20261005", 1250.0, "10000101", "LIQ BOLETO PADARIA PAO QUENTE"],
  ["20261005", 3480.5, "10000102", "LIQ BOLETO MERCADO BOM PRECO"],
  ["20261007", 5200.0, "10000104", "PIX RECEBIDO CLINICA VIDA SAUDAVEL"],
  ["20261009", 980.0, "10000108", "PIX RECEBIDO RESTAURANTE SABOR CASEIRO"],
  ["20261010", 1890.0, "10000111", "LIQ BOLETO ACADEMIA CORPO EM FORMA"],
  ["20261011", 700.0, "10000112", "PIX RECEBIDO GRAFICA RAPIDA"],
  ["20261012", -320.0, "", "TARIFA PACOTE SERVICOS"],
];
save(
  "extrato.ofx",
  `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKTRANLIST>
${ofxTx
  .map(
    ([d, v, ref, memo], i) =>
      `<STMTTRN><TRNTYPE>${v > 0 ? "CREDIT" : "DEBIT"}<DTPOSTED>${d}120000[-3:BRT]<TRNAMT>${v.toFixed(2)}<FITID>${d}${i}${ref ? `<REFNUM>${ref}` : ""}<MEMO>${memo}</STMTTRN>`,
  )
  .join("\n")}
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`,
);

// Documentos de crédito
save(
  "holerite_maria.txt",
  `DEMONSTRATIVO DE PAGAMENTO - SETEMBRO/2026
Empresa: Tecnologia Horizonte S.A.
Funcionário: Maria Aparecida Souza
CPF: 123.456.789-09
Cargo: Analista Financeira Pleno

Salário base ............ R$ 8.200,00
INSS .................... R$   951,62
IRRF .................... R$   887,11
Vale-transporte ......... R$   180,00

Líquido a receber: R$ 6.181,27
`,
);
const extrato = (linhas) => ["data;descricao;valor", ...linhas].join("\r\n") + "\r\n";
save(
  "extrato_maria.csv",
  extrato([
    "05/07/2026;SALARIO TECNOLOGIA HORIZONTE;6.181,27",
    "08/07/2026;ALUGUEL;-1.900,00",
    "12/07/2026;SUPERMERCADO;-820,40",
    "20/07/2026;ENERGIA E AGUA;-310,15",
    "05/08/2026;SALARIO TECNOLOGIA HORIZONTE;6.181,27",
    "08/08/2026;ALUGUEL;-1.900,00",
    "14/08/2026;SUPERMERCADO;-760,10",
    "21/08/2026;ENERGIA E AGUA;-298,70",
    "05/09/2026;SALARIO TECNOLOGIA HORIZONTE;6.181,27",
    "08/09/2026;ALUGUEL;-1.900,00",
    "13/09/2026;SUPERMERCADO;-845,90",
    "20/09/2026;ENERGIA E AGUA;-305,00",
  ]),
);
save(
  "holerite_joao.txt",
  `DEMONSTRATIVO DE PAGAMENTO - SETEMBRO/2026
Empresa: Comercial Rápido Ltda
Funcionário: Carlos Henrique Lima
CPF: 987.654.321-00
Cargo: Auxiliar de Estoque

Salário base ............ R$ 2.100,00
INSS .................... R$   164,85
Líquido a receber: R$ 1.935,15
`,
);
save(
  "extrato_joao.csv",
  extrato([
    "05/08/2026;SALARIO COMERCIAL RAPIDO;1.935,15",
    "06/08/2026;APOSTA ONLINE BET;-600,00",
    "10/08/2026;ALUGUEL;-900,00",
    "15/08/2026;CHEQUE DEVOLVIDO SEM FUNDOS;-450,00",
    "22/08/2026;CARTAO DE CREDITO;-780,00",
    "05/09/2026;SALARIO COMERCIAL RAPIDO;1.935,15",
    "07/09/2026;APOSTA ONLINE BET;-450,00",
    "10/09/2026;ALUGUEL;-900,00",
    "25/09/2026;CARTAO DE CREDITO;-910,00",
  ]),
);

save(
  "CALCJUROS.cbl",
  `       IDENTIFICATION DIVISION.
       PROGRAM-ID. CALCJUROS.
      * CALCULA ENCARGOS DE BOLETO PAGO EM ATRASO
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-VALOR-TITULO     PIC 9(9)V99.
       01 WS-DIAS-ATRASO      PIC 9(4).
       01 WS-TAXA-JUROS-DIA   PIC 9V9999 VALUE 0.0033.
       01 WS-PERC-MULTA       PIC 9V99 VALUE 0.02.
       01 WS-MULTA            PIC 9(9)V99.
       01 WS-JUROS            PIC 9(9)V99.
       01 WS-VALOR-FINAL      PIC 9(9)V99.
       01 WS-CLIENTE-TIPO     PIC X(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 0 TO WS-MULTA.
           MOVE 0 TO WS-JUROS.
           IF WS-DIAS-ATRASO > 0
              PERFORM CALC-ENCARGOS
           END-IF.
           COMPUTE WS-VALOR-FINAL = WS-VALOR-TITULO + WS-MULTA + WS-JUROS.
           DISPLAY 'VALOR FINAL: ' WS-VALOR-FINAL.
           STOP RUN.
       CALC-ENCARGOS.
           COMPUTE WS-MULTA ROUNDED = WS-VALOR-TITULO * WS-PERC-MULTA.
           IF WS-CLIENTE-TIPO = 'PJ'
              COMPUTE WS-JUROS ROUNDED =
                 WS-VALOR-TITULO * WS-TAXA-JUROS-DIA * WS-DIAS-ATRASO
           ELSE
              COMPUTE WS-JUROS ROUNDED =
                 WS-VALOR-TITULO * 0.0010 * WS-DIAS-ATRASO
           END-IF.
           IF WS-DIAS-ATRASO > 60
              MOVE 0 TO WS-JUROS
              DISPLAY 'TITULO ENVIADO PARA COBRANCA JURIDICA'
           END-IF.
`,
);
// Carteira de inadimplentes (vencimentos relativos à data de hoje, para cobrir todas as faixas)
const venc = (diasAtraso) => {
  const d = new Date(Date.now() - diasAtraso * 86_400_000);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const carteira = [
  ["CT-2024-0101", "Roberto Carlos Mendes", "321.654.987-11", "(11) 98765-4321", "roberto.mendes@exemplo.com", "Empréstimo pessoal", 4200, 12],
  ["CT-2024-0102", "Fernanda Lima Rocha", "456.789.123-22", "(21) 99876-5432", "fernanda.rocha@exemplo.com", "Cartão de crédito", 1850.4, 25],
  ["CT-2024-0103", "Lucas Martins Prado", "789.123.456-33", "(31) 98123-4567", "", "Cheque especial", 980, 45],
  ["CT-2024-0104", "Juliana Alves Costa", "147.258.369-44", "(41) 99234-5678", "juliana.costa@exemplo.com", "Empréstimo pessoal", 7600, 75],
  ["CT-2024-0105", "Paulo Sérgio Nunes", "258.369.147-55", "(51) 98345-6789", "", "Financiamento de veículo", 15800, 110],
  ["CT-2024-0106", "Marcos Vinícius Teixeira", "369.147.258-66", "(61) 99456-7890", "marcos.teixeira@exemplo.com", "Cartão de crédito", 3240.9, 150],
  ["CT-2024-0107", "Beatriz Santos Ferreira", "159.357.486-77", "(71) 98567-8901", "", "Empréstimo pessoal", 5500, 200],
  ["CT-2024-0108", "Ricardo Gomes Barbosa", "357.159.684-88", "(81) 99678-9012", "ricardo.barbosa@exemplo.com", "Capital de giro", 22000, 290],
  ["CT-2024-0109", "Patrícia Oliveira Dias", "951.753.852-99", "(85) 98789-0123", "", "Cheque especial", 1200, 400],
  ["CT-2024-0110", "Eduardo Ramos Cardoso", "753.951.258-00", "(19) 99890-1234", "eduardo.cardoso@exemplo.com", "Empréstimo pessoal", 9800, 540],
  ["CT-2024-0111", "Camila Freitas Moura", "852.456.753-12", "(27) 98901-2345", "", "Cartão de crédito", 640, 18],
  ["CT-2024-0112", "Gustavo Henrique Pires", "12.345.678/0001-90", "(11) 3456-7890", "financeiro@pireseletrica.com.br", "Capital de giro", 38500, 95],
];
save(
  "carteira_inadimplentes.csv",
  [
    "contrato;devedor;cpf_cnpj;telefone;email;produto;valor;vencimento",
    ...carteira.map(([c, n, doc, tel, em, p, v, dias]) => [c, n, doc, tel, em, p, brl(v), venc(dias)].join(";")),
  ].join("\r\n") + "\r\n",
);

// Transações para PLD (últimos 60 dias), com cenários típicos de lavagem e clientes normais
const pldRows = [];
const at = (diasAtras, hora = 10) => {
  const d = new Date(Date.now() - diasAtras * 86_400_000);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(hora).padStart(2, "0")}:00`;
};
const cli = (nome, doc, renda, pep = false) => (dias, tipo, valor, contraparte = "", docContra = "", hora = 10) =>
  pldRows.push([at(dias, hora), nome, doc, renda ? brl(renda) : "", pep ? "S" : "N", tipo, brl(valor), contraparte, docContra].join(";"));

// Clientes normais
const ana = cli("Ana Paula Ribeiro", "111.444.777-35", 5200);
const sandra = cli("Sandra Melo Cavalcanti", "222.555.888-46", 12500);
for (const m of [9, 39]) {
  ana(m, "SALARIO", 5200, "Hospital Santa Clara", "11.222.333/0001-44");
  ana(m - 2, "BOLETO_PAGO", 1450, "Imobiliária Lar");
  ana(m - 6, "PIX_ENVIADO", 380, "Supermercado Bom Dia");
  sandra(m, "SALARIO", 12500, "Indústria Metalfort", "22.333.444/0001-55");
  sandra(m - 3, "TED_ENVIADA", 4000, "Corretora Invest", "33.444.555/0001-66");
  sandra(m - 8, "BOLETO_PAGO", 2100, "Escola Saber");
}

// Fracionamento de depósitos em espécie
const jose = cli("José Antônio Ferraz", "333.666.999-57", 4000);
jose(40, "SALARIO", 4000, "Transportes Rota Sul", "44.555.666/0001-77");
jose(20, "DEPOSITO_ESPECIE", 14000);
jose(18, "DEPOSITO_ESPECIE", 13500);
jose(16, "DEPOSITO_ESPECIE", 12900);
jose(13, "DEPOSITO_ESPECIE", 14500);
jose(12, "TED_ENVIADA", 50000, "Auto Center Premium", "55.666.777/0001-88");

// Espécie acima de R$ 50 mil (comunicação obrigatória)
const ouro = cli("Comercial Ouro Fino Ltda", "12.345.678/0001-95", 180000);
ouro(30, "TED_RECEBIDA", 92000, "Rede Varejo Norte", "66.777.888/0001-99");
ouro(15, "DEPOSITO_ESPECIE", 85000);
ouro(14, "BOLETO_PAGO", 60000, "Fornecedor Atacadão");

// Conta de passagem
const diego = cli("Diego Souza Lima", "444.777.111-68", 2800);
diego(50, "SALARIO", 2800, "Padaria Central", "77.888.999/0001-00");
for (const [d, v, de, para] of [[45, 25000, "Alfa Serviços ME", "Beta Importadora"], [33, 32000, "Gama Consultoria", "Beta Importadora"], [21, 18000, "Delta Eventos", "Ômega Trading"], [9, 40000, "Alfa Serviços ME", "Ômega Trading"]]) {
  diego(d, "TED_RECEBIDA", v, de, "", 9);
  diego(d, "PIX_ENVIADO", v - 500, para, "", 15);
}

// Conta "laranja": muitos remetentes diferentes
const lari = cli("Larissa Monteiro Alves", "555.888.222-79", 1500);
const nomes = ["Carlos A.", "Bruna T.", "Felipe R.", "Gabriela S.", "Henrique M.", "Isabela C.", "João V.", "Karen L.", "Leandro P.", "Mônica F.", "Nelson D.", "Olívia B.", "Pedro H.", "Quésia N.", "Rafael G."];
nomes.forEach((n, i) => lari(28 - i, "PIX_RECEBIDO", 1200 + ((i * 437) % 1900), n, `${String(100 + i).padStart(3, "0")}.${String(200 + i)}.${String(300 + i)}-${String(10 + i)}`));
lari(10, "PIX_ENVIADO", 24000, "Ômega Trading");

// PEP recebendo de contraparte em lista restritiva
const pep = cli("Fernando Aguiar Neto", "666.999.333-80", 35000, true);
pep(55, "SALARIO", 35000, "Assembleia Legislativa", "00.111.222/0001-33");
pep(25, "SALARIO", 35000, "Assembleia Legislativa", "00.111.222/0001-33");
pep(22, "TED_RECEBIDA", 400000, "Construtora Horizonte Azul", "99.888.777/0001-66");
pep(20, "TED_ENVIADA", 150000, "Fazenda Boa Esperança", "88.999.000/0001-11");
pep(19, "SAQUE_ESPECIE", 45000);

// Moderado: pico de movimentação acima da renda
const marcos = cli("Marcos Tavares Silva", "777.111.444-91", 6000);
marcos(40, "SALARIO", 6000, "Escritório Contábil Exato", "99.000.111/0001-22");
marcos(10, "SALARIO", 6000, "Escritório Contábil Exato", "99.000.111/0001-22");
marcos(8, "PIX_RECEBIDO", 15000, "Venda de veículo - Paulo R.", "123.456.789-00");
marcos(6, "BOLETO_PAGO", 14000, "Financiamento imobiliário");

save(
  "transacoes_pld.csv",
  ["data;cliente;cpf_cnpj;renda_mensal;pep;tipo;valor;contraparte;doc_contraparte", ...pldRows].join("\r\n") + "\r\n",
);

console.log("Arquivos de demonstração gerados em public/demo");
