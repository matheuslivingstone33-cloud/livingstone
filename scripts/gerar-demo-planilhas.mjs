// Gera as planilhas de exemplo da conciliação com layout (public/demo). Só escreve os 3 arquivos abaixo.
import { writeFileSync } from "node:fs";
import { buildXlsx } from "./xlsx-mini.mjs";

const dir = new URL("../public/demo/", import.meta.url);
const save = (name, data) => writeFileSync(new URL(name, dir), data);

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
save(
  "esperados_layout_alt.csv",
  ['"Nosso Número","Cliente","Vlr Pago","Dt Venc","Obs"', ...titulos.map(([r, p, v, d], i) => `${r},"${p}",${v},${d},"${i % 2 ? "Boleto, carteira 1" : "Boleto"}"`)].join("\r\n") + "\r\n",
);

// Extrato em planilha: título na linha 1, cabeçalho na linha 3, datas seriais do Excel e débitos negativos
const serial = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);
save(
  "extrato_planilha.xlsx",
  buildXlsx([
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
);

// Planilha com nomes de coluna desconhecidos e linhas inválidas (teste de erro por linha)
save("esperados_ruim.csv", ["Codigo;Quantia;Quando", "A1;100,00;05/10/2026", "A2;abc;06/10/2026", "A3;-5,00;31/02/2026", ";;"].join("\r\n") + "\r\n");
console.log("Planilhas de exemplo geradas em public/demo");
