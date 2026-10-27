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
};

const ABAS = Object.keys(AJUDA) as Aba[];

/** Texto do guia: uma seção por aba, com o que ela faz e os passos. */
export const GUIA_ASSISTENTE: string = ABAS.map((a) => {
  const h = AJUDA[a];
  return `## ${h.titulo} (${ROTA[a]})\n${h.frases.join(" ")}\nPassos: ${h.passos.map((p, i) => `${i + 1}. ${p}`).join(" ")}`;
})
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
