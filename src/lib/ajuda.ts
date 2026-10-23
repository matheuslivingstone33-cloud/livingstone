// Textos de ajuda de cada aba ("Para que serve"). Puro: sem banco, sem Next.
// Só descrevem o que a tela já faz; nada de prometer capacidade que não existe.

export type Aba = "dashboard" | "conciliacao" | "cobranca" | "pld" | "credito" | "legado" | "auditoria" | "configuracoes" | "usuarios";

export type Exemplo = { href: `/demo/${string}`; rotulo: string };

export type Ajuda = {
  titulo: string;
  /** 2 a 3 frases curtas, em linguagem simples. */
  frases: string[];
  passos: [string, string, string];
  exemplos?: Exemplo[];
  /** Texto do estado vazio da lista principal, com exemplo para baixar quando houver. */
  vazio: { texto: string; exemplo?: Exemplo };
};

const CARTEIRA: Exemplo = { href: "/demo/carteira_inadimplentes.csv", rotulo: "carteira de exemplo (CSV)" };
const TRANSACOES: Exemplo = { href: "/demo/transacoes_pld.csv", rotulo: "transações de exemplo (CSV)" };
const EXTRATO_JOAO: Exemplo = { href: "/demo/extrato_joao.csv", rotulo: "extrato de exemplo (CSV)" };
const HOLERITE_JOAO: Exemplo = { href: "/demo/holerite_joao.txt", rotulo: "holerite de exemplo (TXT)" };
const COBOL: Exemplo = { href: "/demo/CALCJUROS.cbl", rotulo: "programa COBOL de exemplo" };
const CNAB: Exemplo = { href: "/demo/retorno_cnab400.ret", rotulo: "retorno do banco CNAB 400 de exemplo" };
const TITULOS: Exemplo = { href: "/demo/titulos_esperados.csv", rotulo: "títulos esperados de exemplo (CSV)" };
const OFX: Exemplo = { href: "/demo/extrato.ofx", rotulo: "extrato OFX de exemplo" };

export const AJUDA: Record<Aba, Ajuda> = {
  dashboard: {
    titulo: "Painel",
    frases: [
      "Mostra num só lugar o que a cobrança recuperou, o que está pendente na conciliação e os prazos de PLD mais próximos.",
      "Os números vêm do que já foi importado nos módulos; nada aqui é estimativa.",
    ],
    passos: ["Leia o resumo do dia no topo.", "Clique num indicador para abrir o módulo correspondente.", "Confira a atividade recente no fim da página."],
    vazio: { texto: "Ainda não há dados. Comece importando arquivos em Cobrança, Conciliação ou PLD." },
  },
  conciliacao: {
    titulo: "Conciliação bancária",
    frases: [
      "Compara o arquivo que o banco devolve (CNAB 400 ou 240, OFX ou CSV) com a lista de títulos que você esperava receber.",
      "Aponta o que foi pago, o que veio com valor diferente e o que não entrou, para você resolver só as exceções.",
    ],
    passos: ["Envie o arquivo do banco.", "Envie a lista de títulos esperados (CSV).", "Clique em Conciliar e resolva as divergências no detalhe."],
    exemplos: [CNAB, TITULOS, OFX],
    vazio: { texto: "Nenhuma conciliação ainda. Envie o retorno do banco e a lista de títulos esperados para começar.", exemplo: CNAB },
  },
  cobranca: {
    titulo: "Cobrança e renegociação",
    frases: [
      "Atualiza cada dívida com multa e juros, monta opções de acordo pela faixa de atraso e gera a mensagem com o link de pagamento por Pix.",
      "O devedor escolhe a condição no link; o pagamento é registrado pelo Pix ou à mão.",
    ],
    passos: ["Importe a carteira de inadimplentes (CSV).", "Gere a proposta de um contrato ou de todos em aberto.", "Envie a mensagem ao devedor e acompanhe o pagamento."],
    exemplos: [CARTEIRA],
    vazio: { texto: "Nenhum contrato ainda. Importe a carteira de inadimplentes para começar.", exemplo: CARTEIRA },
  },
  pld: {
    titulo: "PLD / COAF",
    frases: [
      "Analisa um arquivo de transações com regras de prevenção à lavagem de dinheiro e abre um caso para cada cliente com alerta.",
      "Cada caso tem prazo de análise; você decide se arquiva ou comunica ao COAF, com dossiê pronto para revisar.",
    ],
    passos: ["Envie o arquivo de transações (CSV).", "Abra os casos em análise, começando pelos que vencem antes.", "Revise o dossiê e registre a decisão."],
    exemplos: [TRANSACOES],
    vazio: { texto: "Nenhum caso nesta situação. Envie um arquivo de transações para gerar os casos.", exemplo: TRANSACOES },
  },
  credito: {
    titulo: "Análise de crédito",
    frases: [
      "Lê os documentos do solicitante (holerite, extrato), extrai renda e gastos e aplica a política de crédito da instituição.",
      "O sistema sugere aprovar, recusar ou mandar para análise humana; a decisão final é do analista.",
    ],
    passos: ["Preencha os dados da proposta.", "Anexe os documentos do solicitante.", "Clique em Analisar e registre a decisão no detalhe."],
    exemplos: [EXTRATO_JOAO, HOLERITE_JOAO],
    vazio: { texto: "Nenhuma análise ainda. Preencha a proposta e anexe os documentos do solicitante para começar.", exemplo: HOLERITE_JOAO },
  },
  legado: {
    titulo: "Código legado",
    frases: [
      "Recebe um programa em COBOL, Delphi ou VB6, explica o que ele faz e lista as regras de negócio encontradas.",
      "Também gera uma versão na linguagem escolhida, como ponto de partida para revisão da equipe técnica.",
    ],
    passos: ["Envie o arquivo de código.", "Escolha a linguagem de destino.", "Clique em Analisar e revise as regras e o código gerado."],
    exemplos: [COBOL],
    vazio: { texto: "Nenhum programa analisado ainda. Envie um arquivo de código legado para começar.", exemplo: COBOL },
  },
  auditoria: {
    titulo: "Trilha de auditoria",
    frases: [
      "Lista as ações feitas na plataforma: quem fez, o quê e quando.",
      "Os registros são encadeados; a página confere a corrente e avisa se algo foi alterado direto no banco.",
    ],
    passos: ["Filtre por período, pessoa ou ação.", "Confira o aviso de integridade no topo.", "Baixe o recibo de integridade e guarde-o fora do sistema para conferir depois."],
    vazio: { texto: "Sem registros para estes filtros." },
  },
  configuracoes: {
    titulo: "Configurações",
    frases: [
      "Reúne os ajustes da instituição: Pix, layout do banco, políticas de crédito, cobrança e PLD, teto de IA, listas restritivas e chaves da API.",
      "As mudanças valem para todos os usuários e ficam registradas na auditoria.",
    ],
    passos: ["Abra a seção que quer ajustar.", "Altere os valores.", "Clique em Salvar configurações."],
    vazio: { texto: "Nada configurado ainda." },
  },
  usuarios: {
    titulo: "Usuários",
    frases: [
      "Cadastra quem acessa a plataforma e define o perfil de cada pessoa.",
      "Administradores e analistas operam os módulos; auditores só consultam.",
    ],
    passos: ["Preencha nome, e-mail, senha e perfil.", "Clique em Adicionar.", "Altere o perfil, desative ou encerre sessões quando precisar."],
    vazio: { texto: "Nenhum usuário além de você." },
  },
};
