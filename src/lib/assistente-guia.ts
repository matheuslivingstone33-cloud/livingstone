// Guia do assistente, montado dos textos de ajuda das abas. Puro e estático: o mesmo texto em toda chamada (cache).
import { AJUDA, type Aba } from "./ajuda";

const ROTA: Record<Aba, string> = {
  dashboard: "/dashboard",
  conciliacao: "/conciliacao",
  cobranca: "/cobranca",
  pld: "/pld",
  credito: "/credito",
  legado: "/legado",
  auditoria: "/auditoria",
  configuracoes: "/configuracoes",
  usuarios: "/usuarios",
  consolidado: "/consolidado",
};

const ABAS = Object.keys(AJUDA) as Aba[];

/** Texto do guia: uma seção por aba, com o que ela faz e os passos. */
export const GUIA_ASSISTENTE: string = ABAS.map((a) => {
  const h = AJUDA[a];
  return `## ${h.titulo} (${ROTA[a]})\n${h.frases.join(" ")}\nPassos: ${h.passos.map((p, i) => `${i + 1}. ${p}`).join(" ")}`;
})
  .concat(
    "## Taxa de cartão na conciliação (/configuracoes, seção Taxas por forma de recebimento)\nA plataforma já trata taxa de cartão: cadastre a forma (ex.: credito), a taxa em % e, se houver, o valor fixo por transação. A lista de esperados traz o valor bruto e uma coluna de forma de pagamento; o extrato traz o líquido. Na conciliação, os itens em Valor diferente cuja diferença bate com a taxa ganham o rótulo Explicado pela taxa e mostram bruto, taxa e líquido; o filtro separa explicados pela taxa e para resolver. A aceitação continua manual. Arquivos de exemplo: esperados_cartao.csv e extrato_cartao.csv.",
    "## Planilhas em qualquer formato, inglês e dólar (/conciliacao)\nNo primeiro envio de um modelo de planilha, a tela de conferência mostra cada coluna com exemplos e o campo do sistema; colunas não reconhecidas perguntam O que é esta coluna. Aceita cabeçalhos em inglês, valores 1,234.56 e (150.00), datas americanas e por extenso. A pessoa confirma a moeda (Real ou Dólar) de cada planilha; com moedas diferentes informa a cotação (R$ por US$ 1), e diferenças pequenas ganham o rótulo Diferença de câmbio.",
    "## P&L do QuickBooks pelo assistente (/consolidado)\nAnexe no chat do assistente o PDF Profit & Loss do QuickBooks de um único mês: ele mostra mês, empresa, receita e lucro líquido e o botão Lançar no Consolidado; ao confirmar, o mês entra como rascunho no Consolidado para conferir.",
    "## Biblioteca de documentos (/biblioteca)\nAnexe no assistente uma planilha, PDF ou imagem: ele explica o documento e pergunta se é isso; ao confirmar, a explicação fica na Biblioteca e documentos parecidos passam a ser reconhecidos.",
  )
  .concat("## Pedidos de melhoria\nDescreva no assistente uma necessidade que a plataforma não atende: ele registra o entendimento, você confirma ou ajusta, e fica registrado para a equipe avaliar.")
  .join("\n\n");

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");
const PARADAS = new Set(["como", "para", "que", "uma", "um", "o", "a", "os", "as", "de", "do", "da", "dos", "das", "e", "eu", "em", "no", "na", "faco", "fazer", "serve", "qual", "onde", "com", "por", "se", "meu", "minha"]);
const palavras = (s: string) => norm(s).split(/\s+/).filter((w) => w.length > 2 && !PARADAS.has(w));

/** Sem chave de IA: escolhe a aba do guia com mais palavras em comum com a pergunta. */
export function responderSemIa(pergunta: string): string {
  const ps = palavras(pergunta);
  let melhor: Aba | null = null;
  let pontos = 0;
  for (const a of ABAS) {
    const h = AJUDA[a];
    const texto = new Set(palavras([h.titulo, ...h.frases, ...h.passos].join(" ")));
    const titulo = new Set(palavras(h.titulo));
    const p = ps.reduce((acc, w) => acc + (titulo.has(w) ? 3 : texto.has(w) ? 1 : 0), 0);
    if (p > pontos) {
      pontos = p;
      melhor = a;
    }
  }
  const aviso = "A IA não está configurada; respondo só com o guia da plataforma.";
  if (!melhor) return `${aviso} Não achei esse assunto. Pergunte sobre conciliação, cobrança, PLD, crédito, código legado, auditoria ou configurações.`;
  const h = AJUDA[melhor];
  return `${aviso}\n${h.titulo} (${ROTA[melhor]}): ${h.frases.join(" ")}\nPassos: ${h.passos.map((p, i) => `${i + 1}. ${p}`).join(" ")}`;
}
