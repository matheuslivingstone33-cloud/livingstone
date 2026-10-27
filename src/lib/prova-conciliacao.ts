// Prova da conciliação: para cada item, a linha de cada arquivo que sustenta o resultado, com o trecho usado destacado.
// Puro: sem banco nem Next. O arquivo original nunca é guardado; só as linhas usadas, com CPF/CNPJ mascarados.
import { createHash } from "node:crypto";
import { DEFAULT_CNAB400, normRef, parseDate, parseMoney, type BankEntry, type Cnab400Layout, type ExpectedEntry, type MatchedItem, type Origem, type ReconcileOptions } from "./reconcile";
import { mascararDocs } from "./mascara";

export const PROVA_LIMITES = { celula: 200, colunas: 50, bruto: 1000, itemBytes: 8 * 1024, totalBytes: 5_000_000 } as const;

/** Onde está o campo usado: coluna da grade (0-based), faixa posicional CNAB (1-based, no segmento N) ou tag OFX/chave JSON. */
export type Marca = { coluna: number } | { faixa: [number, number]; segmento?: number } | { tag: string };
export type Destaque = { referencia?: Marca; valor?: Marca; data?: Marca };
export type Lado = {
  arquivo: string;
  formato: string;
  sha256: string;
  linha: number;
  cabecalho?: string[];
  celulas?: string[];
  bruto?: string;
  destaque: Destaque;
  truncada?: true;
};
export type Regra = {
  rule?: string;
  toleranciaCentavos: number;
  toleranciaDias: number;
  casarPorValorData: boolean;
  diferencaCentavos?: number;
  atrasoDias?: number;
  layoutCnab?: Cnab400Layout;
  /** Taxa de cartão (pista; não muda o status). Ausentes em conciliações antigas ou sem regra para a forma. */
  formaPagamento?: string;
  brutoCentavos?: number;
  taxaCentavos?: number;
  explicadoTaxa?: boolean;
};
/** omitida: a conciliação passou do teto de tamanho e esta prova não foi guardada. */
export type Prova = { v: 1; esperado?: Lado; banco?: Lado; regra: Regra; omitida?: true };

/** Metadados de um arquivo (o conteúdo fica só nas linhas usadas). `colunas`: índices conhecidos pelo layout. */
export type FonteProva = { arquivo: string; formato: string; sha256: string; cabecalho?: string[]; colunas?: { referencia?: number; valor?: number; data?: number } };
export type FonteComDados<E> = FonteProva & { entries: E[] };
export type OpcoesProva = Partial<ReconcileOptions> & { cnab400?: Cnab400Layout };

export const sha256Hex = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** JSON com chaves em ordem: o mesmo conteúdo dá sempre o mesmo texto (e o mesmo hash). */
export function jsonCanonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

// ---------- CPF/CNPJ ----------

export { DOC, mascararDocs, mascararUm } from "./mascara";

// Campos de inscrição (CPF/CNPJ) nos registros CNAB: mascarados pela posição
const POS_DOC: Record<string, { faixa: [number, number]; segmento: number }[]> = {
  CNAB400: [{ faixa: [4, 17], segmento: 0 }],
  CNAB240: [{ faixa: [134, 148], segmento: 0 }],
};

function mascararBruto(bruto: string, formato: string): string {
  const pos = POS_DOC[formato];
  if (!pos) return mascararDocs(bruto);
  const linhas = bruto.split("\n");
  for (const { faixa: [a, b], segmento } of pos) {
    const l = linhas[segmento];
    const campo = l?.slice(a - 1, b) ?? "";
    // Campo zerado ou em branco não tem documento: fica como veio
    if (l && l.length >= b && /[1-9]/.test(campo)) linhas[segmento] = l.slice(0, a - 1) + campo.replace(/\d/g, "*") + l.slice(b);
  }
  return linhas.join("\n");
}

// ---------- destaque ----------

const cents = (n: number) => Math.round(n * 100);
const DIA = 86_400_000;

function marcasGrade(celulas: string[], e: { reference: string; amount: number }, data: Date | undefined, colunas: FonteProva["colunas"]): Destaque {
  const achar = (ok: (c: string) => boolean) => {
    const i = celulas.findIndex((c) => c.trim() !== "" && ok(c));
    return i >= 0 ? { coluna: i } : undefined;
  };
  const col = (i?: number) => (i !== undefined && i >= 0 && i < celulas.length ? { coluna: i } : undefined);
  const ref = normRef(e.reference);
  return {
    referencia: col(colunas?.referencia) ?? (e.reference ? achar((c) => normRef(c) === ref) : undefined),
    valor: col(colunas?.valor) ?? achar((c) => {
      const v = parseMoney(c, "br") ?? parseMoney(c, "ofx");
      return v !== null && cents(Math.abs(v)) === cents(e.amount);
    }),
    data: col(colunas?.data) ?? (data ? achar((c) => parseDate(c)?.getTime() === data.getTime()) : undefined),
  };
}

function marcasBruto(formato: string, bruto: string, e: { reference: string }, cnab400: Cnab400Layout): Destaque {
  if (formato === "CNAB400") return { referencia: { faixa: cnab400.nossoNumero }, valor: { faixa: cnab400.valorPago }, data: { faixa: cnab400.dataOcorrencia } };
  if (formato === "CNAB240") return { referencia: { faixa: [38, 57], segmento: 0 }, valor: { faixa: [78, 92], segmento: 1 }, data: { faixa: [138, 145], segmento: 1 } };
  if (formato === "JSON") return { referencia: { tag: "referencia" }, valor: { tag: "valor" }, data: { tag: /"vencimento"/.test(bruto) ? "vencimento" : "data" } };
  // OFX: a referência pode ter vindo de REFNUM, CHECKNUM, MEMO ou FITID
  const valorTag = (t: string) => bruto.match(new RegExp(`<${t}>([^<\\r\\n]*)`, "i"))?.[1] ?? "";
  const ref = ["REFNUM", "CHECKNUM", "MEMO", "FITID"].find((t) => e.reference && valorTag(t).includes(e.reference));
  return { referencia: ref ? { tag: ref } : undefined, valor: { tag: "TRNAMT" }, data: { tag: "DTPOSTED" } };
}

type Trecho = { inicio: number; fim: number; campo: keyof Destaque };

/** Posições (no texto bruto) dos trechos destacados, em ordem e sem sobreposição. */
export function trechosDestacados(bruto: string, destaque: Destaque): Trecho[] {
  const linhas = bruto.split("\n");
  const inicioLinha = linhas.map((_, i) => linhas.slice(0, i).reduce((a, l) => a + l.length + 1, 0));
  const out: Trecho[] = [];
  for (const campo of ["referencia", "valor", "data"] as const) {
    const m = destaque[campo];
    if (!m || "coluna" in m) continue;
    if ("faixa" in m) {
      const s = m.segmento ?? 0;
      if (s >= linhas.length) continue;
      const base = inicioLinha[s];
      const [a, b] = m.faixa;
      const fim = Math.min(b, linhas[s].length);
      if (fim >= a) out.push({ inicio: base + a - 1, fim: base + fim, campo });
      continue;
    }
    const rx = bruto.startsWith("{") ? new RegExp(`"${m.tag}":("(?:[^"\\\\]|\\\\.)*"|[^,}]*)`) : new RegExp(`<${m.tag}>([^<\\r\\n]*)`, "i");
    const x = rx.exec(bruto);
    if (x) out.push({ inicio: x.index + x[0].length - x[1].length, fim: x.index + x[0].length, campo });
  }
  out.sort((a, b) => a.inicio - b.inicio);
  return out.filter((t, i) => i === 0 || t.inicio >= out[i - 1].fim);
}

/** Texto bruto em pedaços, cada um com o campo destacado (ou nenhum), para a tela. */
export function partesDestacadas(bruto: string, destaque: Destaque): { texto: string; campo?: keyof Destaque }[] {
  const partes: { texto: string; campo?: keyof Destaque }[] = [];
  let p = 0;
  for (const t of trechosDestacados(bruto, destaque)) {
    if (t.inicio > p) partes.push({ texto: bruto.slice(p, t.inicio) });
    partes.push({ texto: bruto.slice(t.inicio, t.fim), campo: t.campo });
    p = t.fim;
  }
  if (p < bruto.length) partes.push({ texto: bruto.slice(p) });
  return partes;
}

const corta = (s: string) => mascararDocs(s).slice(0, PROVA_LIMITES.celula);

function lado(fonte: FonteProva, e: ExpectedEntry | BankEntry, data: Date | undefined, cnab400: Cnab400Layout): Lado {
  const o: Origem = e.origem ?? { linha: 0 };
  const base: Lado = { arquivo: fonte.arquivo, formato: fonte.formato, sha256: fonte.sha256, linha: o.linha, destaque: {} };
  if (o.celulas) {
    const celulas = o.celulas.slice(0, PROVA_LIMITES.colunas);
    base.cabecalho = (fonte.cabecalho ?? []).slice(0, PROVA_LIMITES.colunas).map(corta);
    base.destaque = marcasGrade(celulas, e, data, fonte.colunas);
    base.celulas = celulas.map(corta);
  } else if (o.bruto) {
    base.destaque = marcasBruto(fonte.formato, o.bruto, e, cnab400);
    base.bruto = mascararBruto(o.bruto.slice(0, PROVA_LIMITES.bruto), fonte.formato);
  }
  return base;
}

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** Mantém só as células destacadas (as outras ficam vazias, para os índices valerem). */
function enxugar(l: Lado): Lado {
  const usadas = new Set(Object.values(l.destaque).flatMap((m) => (m && "coluna" in m ? [m.coluna] : [])));
  const so = (xs?: string[]) => xs?.map((c, i) => (usadas.has(i) ? c : ""));
  return { ...l, cabecalho: so(l.cabecalho), celulas: so(l.celulas), truncada: true };
}

/** Prova de um item: a linha do título esperado, a do crédito no banco e a regra que decidiu. */
export function montarProva(
  item: MatchedItem,
  esperados: FonteComDados<ExpectedEntry>,
  banco: FonteComDados<BankEntry>,
  options: OpcoesProva = {},
  /** Resultado de classificarTaxa (taxa-recebimento.ts) para o item, se houver. */
  taxa?: { formaPagamento?: string; taxaEsperada?: number; explicadoTaxa: boolean },
): Prova {
  const cnab400 = options.cnab400 ?? DEFAULT_CNAB400;
  const e = item.expectedIndex !== undefined ? esperados.entries[item.expectedIndex] : undefined;
  const b = item.receivedIndex !== undefined ? banco.entries[item.receivedIndex] : undefined;
  const regra: Regra = {
    rule: item.rule,
    toleranciaCentavos: options.toleranciaCentavos ?? 0,
    toleranciaDias: options.toleranciaDias ?? 0,
    casarPorValorData: options.casarPorValorData ?? false,
  };
  if (e && b) {
    regra.diferencaCentavos = cents(b.amount) - cents(e.amount);
    regra.atrasoDias = atraso(e.dueAt, b.paidAt);
  }
  if (b && banco.formato === "CNAB400") regra.layoutCnab = cnab400;
  if (taxa?.formaPagamento) regra.formaPagamento = taxa.formaPagamento;
  if (e && taxa?.taxaEsperada !== undefined) {
    regra.brutoCentavos = cents(e.amount);
    regra.taxaCentavos = cents(taxa.taxaEsperada);
    regra.explicadoTaxa = taxa.explicadoTaxa;
  }
  const prova: Prova = { v: 1, regra };
  if (e) prova.esperado = lado(esperados, e, e.dueAt, cnab400);
  if (b) prova.banco = lado(banco, b, b.paidAt, cnab400);
  if (bytes(prova) > PROVA_LIMITES.itemBytes) {
    if (prova.esperado) prova.esperado = enxugar(prova.esperado);
    if (prova.banco) prova.banco = enxugar(prova.banco);
  }
  return prova;
}

/** Teto por conciliação: depois dele, a prova do item fica marcada como não guardada. */
export function limitarTotal(provas: Prova[], teto: number = PROVA_LIMITES.totalBytes): Prova[] {
  let total = 0;
  return provas.map((p) => {
    total += bytes(p);
    return total <= teto ? p : { v: 1, regra: p.regra, omitida: true };
  });
}

/** Lê o JSON gravado; qualquer outra forma conta como prova indisponível. */
export function lerProva(x: unknown): Prova | null {
  if (!x || typeof x !== "object" || (x as { v?: unknown }).v !== 1) return null;
  return x as Prova;
}

// ---------- grupos e frases ----------

export type Grupo = "pagos" | "diferente" | "nao_chegou" | "sem_cobranca";
export const GRUPOS: Grupo[] = ["pagos", "diferente", "nao_chegou", "sem_cobranca"];
export const ROTULO_GRUPO: Record<Grupo, string> = { pagos: "Pagos", diferente: "Valor diferente", nao_chegou: "Não chegou", sem_cobranca: "Entrou sem cobrança" };

/** Grupo da tela. Baixado (resolvido manualmente) fica no grupo de onde saiu. */
export function grupoDe(status: string, originalStatus?: string | null): Grupo {
  if (status === "BAIXADO") return originalStatus && originalStatus !== "BAIXADO" ? grupoDe(originalStatus) : "nao_chegou";
  if (status === "CONCILIADO" || status === "VINCULADO") return "pagos";
  if (status === "DIVERGENTE") return "diferente";
  if (status === "NAO_ESPERADO") return "sem_cobranca";
  return "nao_chegou";
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
/** dd/mm de uma data de calendário (meia-noite UTC), sem virar o dia anterior no fuso local. */
export const diaMes = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

function atraso(due?: Date | null, paid?: Date | null) {
  if (!due || !paid) return 0;
  return Math.max(0, Math.round((paid.getTime() - due.getTime()) / DIA));
}

export type ItemFrase = {
  reference: string;
  payer?: string | null;
  expectedAmount?: number | null;
  receivedAmount?: number | null;
  paidAt?: Date | null;
  dueAt?: Date | null;
  status: string;
  originalStatus?: string | null;
  rule?: string | null;
};

/** `pagas`: referências (normRef) dos títulos que já tiveram pagamento, para apontar possível duplicidade. */
export function fraseItem(item: ItemFrase, ctx: { pagas?: Set<string> } = {}): string {
  const st = item.status === "BAIXADO" ? item.originalStatus ?? "PENDENTE" : item.status;
  const quem = item.payer ? `, ${item.payer}` : "";
  const em = item.paidAt ? ` em ${diaMes(item.paidAt)}` : "";
  const esp = item.expectedAmount ?? 0;
  const rec = item.receivedAmount ?? 0;
  let f: string;
  if (st === "NAO_ESPERADO" || st === "VINCULADO") {
    const nome = item.reference ? `Crédito ${item.reference}${quem}` : `Crédito sem referência${quem}`;
    if (st === "VINCULADO") f = `${nome}: entrou ${brl(rec)}${em}, ligado manualmente a um boleto.`;
    else if (item.reference && ctx.pagas?.has(normRef(item.reference))) f = `${nome}: entrou ${brl(rec)}${em}, possível duplicidade do boleto ${item.reference}.`;
    else f = `${nome}: entrou ${brl(rec)}${em} sem cobrança correspondente.`;
  } else {
    const nome = `Boleto ${item.reference}${quem}`;
    if (st === "PENDENTE") f = `${nome}: esperado ${brl(esp)}${item.dueAt ? ` com vencimento ${diaMes(item.dueAt)}` : ""}, não chegou.`;
    else if (cents(rec) !== cents(esp)) f = `${nome}: esperado ${brl(esp)}, caiu ${brl(rec)}${em}${st === "CONCILIADO" ? " (diferença aceita)" : ""}.`;
    else {
      const d = atraso(item.dueAt, item.paidAt);
      f = `${nome}: pago ${brl(rec)}${em}${d > 0 ? `, com ${d} ${d === 1 ? "dia" : "dias"} de atraso` : ""}.`;
    }
    if (item.rule === "VALOR_DATA") f = f.replace(/\.$/, " (casado por valor e data, sem referência no banco).");
  }
  return item.status === "BAIXADO" ? `${f} Resolvido manualmente.` : f;
}

const REGRA_TXT: Record<string, string> = {
  REFERENCIA: "Casado pela referência do título, igual nos dois arquivos.",
  REFERENCIA_DV: "Casado pela referência do título; o banco acrescentou o dígito verificador no fim.",
  VALOR_DATA: "Casado por valor exato e data próxima, porque o banco não trouxe a referência.",
  MANUAL: "Ligado manualmente por uma pessoa da equipe.",
};

/** Regra aplicada em frases simples. */
export function fraseRegra(r: Regra): string[] {
  const out: string[] = [];
  if (r.rule) out.push(REGRA_TXT[r.rule] ?? r.rule);
  if (r.diferencaCentavos !== undefined) {
    const d = Math.abs(r.diferencaCentavos);
    if (d === 0) out.push("Valor igual ao esperado.");
    else if (d <= r.toleranciaCentavos) out.push(`Diferença de ${brl(d / 100)}, dentro da tolerância de ${r.toleranciaCentavos} centavo(s): conta como pago.`);
    else out.push(`Diferença de ${brl(d / 100)} ${r.diferencaCentavos > 0 ? "a mais" : "a menos"}, acima da tolerância de ${r.toleranciaCentavos} centavo(s).`);
  }
  if (r.brutoCentavos !== undefined && r.taxaCentavos !== undefined) {
    const liquido = r.brutoCentavos - r.taxaCentavos;
    out.push(`${r.formaPagamento ? `Forma de recebimento: ${r.formaPagamento}. ` : ""}Bruto esperado ${brl(r.brutoCentavos / 100)}, taxa ${brl(r.taxaCentavos / 100)}, líquido esperado ${brl(liquido / 100)}.`);
    if (r.explicadoTaxa) out.push("Diferença explicada pela taxa da forma de recebimento. É uma pista: a aceitação continua manual.");
    else if (r.diferencaCentavos !== undefined && Math.abs(r.diferencaCentavos) > r.toleranciaCentavos) {
      const alem = r.brutoCentavos + r.diferencaCentavos - liquido;
      out.push(alem === 0 ? "Valor igual ao líquido esperado." : `Diferença além da taxa: ${brl(Math.abs(alem) / 100)} ${alem > 0 ? "a mais" : "a menos"} que o líquido esperado.`);
    }
  }
  if (r.atrasoDias) out.push(`Pago ${r.atrasoDias} ${r.atrasoDias === 1 ? "dia" : "dias"} depois do vencimento.`);
  if (!r.rule) out.push(r.casarPorValorData ? `Nenhum par encontrado pela referência nem por valor e data (±${r.toleranciaDias} dia(s)).` : "Nenhum par encontrado pela referência.");
  return out;
}

/** Nome e 12 primeiros caracteres do hash de cada arquivo, para a auditoria. */
export const resumoArquivos = (f: { esperados: FonteProva; banco: FonteProva }) =>
  ` · banco ${f.banco.arquivo} (sha256 ${f.banco.sha256.slice(0, 12)}) · esperados ${f.esperados.arquivo} (sha256 ${f.esperados.sha256.slice(0, 12)})`;
