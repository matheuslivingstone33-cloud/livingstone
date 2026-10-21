// Snapshot curado para o tour público de Crédito e Legado.
// Valores copiados do que analyzeCredit e analyzeLegacy produzem com regras locais (sem IA)
// para os arquivos de public/demo/ (veja os testes em tests/modulos.test.mts). Não chama IA.

export const TOUR_CREDIT = [
  {
    applicant: "Maria Aparecida Souza",
    files: ["holerite_maria.txt", "extrato_maria.csv"],
    requested: 15000,
    months: 24,
    monthlyRate: 0.025,
    income: 6181.27,
    installment: 838.69,
    commitment: 0.1357,
    score: 770,
    decision: "APROVAR",
    flags: [] as { nivel: "alto" | "medio" | "baixo"; texto: string }[],
  },
  {
    applicant: "João Pereira",
    files: ["holerite_joao.txt", "extrato_joao.csv"],
    requested: 20000,
    months: 12,
    monthlyRate: 0.03,
    income: 1935.15,
    installment: 2009.24,
    commitment: 1.0383,
    score: 0,
    decision: "RECUSAR",
    flags: [
      { nivel: "alto", texto: "CPF/CNPJ informado (111.222.333-44) é inválido (dígitos verificadores não conferem)" },
      { nivel: "alto", texto: "CPF/CNPJ dos documentos (987.654.321-00) difere do informado" },
      { nivel: "alto", texto: "Parcela compromete 104% da renda (limite 35%)" },
      { nivel: "alto", texto: "Extrato com ocorrência: \"CHEQUE DEVOLVIDO SEM FUNDOS\" em 15/08/2026" },
      { nivel: "medio", texto: "Nome nos documentos (\"Carlos Henrique Lima\") não confere com o solicitante" },
      { nivel: "medio", texto: "Gasto com apostas no extrato: \"APOSTA ONLINE BET\"" },
      { nivel: "medio", texto: "Despesas mensais próximas ou acima da renda" },
    ] as { nivel: "alto" | "medio" | "baixo"; texto: string }[],
  },
];

export const TOUR_LEGACY = {
  file: "CALCJUROS.cbl",
  language: "COBOL",
  target: "TypeScript",
  linesOfCode: 35,
  rules: [
    { onde: "MAIN-PARA", regra: "Condição: WS-DIAS-ATRASO > 0" },
    { onde: "MAIN-PARA", regra: "Cálculo: WS-VALOR-FINAL = WS-VALOR-TITULO + WS-MULTA + WS-JUROS" },
    { onde: "CALC-ENCARGOS", regra: "Cálculo (arredondado): WS-MULTA = WS-VALOR-TITULO * WS-PERC-MULTA" },
    { onde: "CALC-ENCARGOS", regra: "Condição: WS-CLIENTE-TIPO = 'PJ'" },
    { onde: "CALC-ENCARGOS", regra: "Cálculo (arredondado): WS-JUROS = WS-VALOR-TITULO * WS-TAXA-JUROS-DIA * WS-DIAS-ATRASO" },
    { onde: "CALC-ENCARGOS", regra: "Cálculo (arredondado): WS-JUROS = WS-VALOR-TITULO * 0.0010 * WS-DIAS-ATRASO" },
    { onde: "CALC-ENCARGOS", regra: "Condição: WS-DIAS-ATRASO > 60" },
  ],
  codeExcerpt: `// Gerado automaticamente a partir de COBOL — revisar antes de usar em produção
export type Dados = {
  wsValorTitulo: number; // PIC 9(9)V99
  wsDiasAtraso: number; // PIC 9(4)
  wsTaxaJurosDia: number; // PIC 9V9999
  wsPercMulta: number; // PIC 9V99
  wsMulta: number; // PIC 9(9)V99
  wsJuros: number; // PIC 9(9)V99
  wsValorFinal: number; // PIC 9(9)V99
  wsClienteTipo: string; // PIC X(2)
};

export function mainPara(d: Dados): void {
  d.wsMulta = 0;
  d.wsJuros = 0;
  if (d.wsDiasAtraso > 0) {
    calcEncargos(d);
  }
  d.wsValorFinal = d.wsValorTitulo + d.wsMulta + d.wsJuros;
  // ...
}`,
};
