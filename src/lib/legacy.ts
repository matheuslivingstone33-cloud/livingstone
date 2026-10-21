import { pickAi, type AiCall } from "./ai";
import { isLegacyShape, type AiStatus } from "./ai-guard";

export type Rule = { onde: string; regra: string };
export type LegacyResult = {
  language: string;
  linesOfCode: number;
  summary: string;
  rules: Rule[];
  modernCode: string;
  provider: string;
  aiStatus: AiStatus;
  aiDetail?: string;
};

export function detectLanguage(name: string, code: string): string {
  if (/\.(cbl|cob|cpy)$/i.test(name) || /IDENTIFICATION\s+DIVISION|PROCEDURE\s+DIVISION/i.test(code)) return "COBOL";
  if (/\.(pas|dpr)$/i.test(name) || /^\s*(unit|program)\s+\w+;/im.test(code)) return "Delphi/Pascal";
  if (/\.(bas|frm|cls)$/i.test(name) || /^\s*(Private |Public )?(Sub|Function)\s+\w+\(/im.test(code)) return "Visual Basic 6";
  return "Desconhecida";
}

const camel = (s: string) =>
  s.toLowerCase().replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");

// Tradução simplificada de COBOL para TypeScript (conversão local, sem IA)
function cobolToTs(code: string): { rules: Rule[]; ts: string; fields: string[]; paragraphs: string[] } {
  const verbs = /^(IF|ELSE|END-IF|COMPUTE|MOVE|PERFORM|DISPLAY|STOP|GOBACK|ADD|SUBTRACT|MULTIPLY|DIVIDE|READ|WRITE|OPEN|CLOSE|CALL|EVALUATE|WHEN|END-|0\d|[1-7]\d\s|\*|[A-Z0-9-]+\.$|[A-Z]+ (DIVISION|SECTION))/i;
  const lines: string[] = [];
  for (const raw of code.split(/\r?\n/)) {
    const l = (/^\d{6}/.test(raw) ? raw.slice(6) : raw).replace(/\s+$/, "");
    // Junta instruções que continuam na linha seguinte (ex.: COMPUTE quebrado)
    if (lines.length && l.trim() && !verbs.test(l.trim()) && !/\.\s*$/.test(lines[lines.length - 1]))
      lines[lines.length - 1] += " " + l.trim();
    else lines.push(l);
  }
  const rules: Rule[] = [];
  const fields: string[] = [];
  const paragraphs: string[] = [];
  const out: string[] = [];
  let inProc = false;
  let current = "";
  let depth = 1;
  const ind = () => "  ".repeat(depth);
  const expr = (e: string) =>
    e
      .replace(/\bIS\s+/gi, "")
      .replace(/\bGREATER THAN\b/gi, ">")
      .replace(/\bLESS THAN\b/gi, "<")
      .replace(/\bEQUAL TO\b/gi, "=")
      .replace(/(?<![<>!=])=(?!=)/g, "===")
      .replace(/'([^']*)'|"([^"]*)"|\b([A-Z][A-Z0-9-]*)\b/gi, (w, q1?: string, q2?: string) => {
        if (q1 !== undefined || q2 !== undefined) return JSON.stringify(q1 ?? q2);
        const ops: Record<string, string> = { AND: "&&", OR: "||", NOT: "!" };
        return ops[w.toUpperCase()] ?? `d.${camel(w)}`;
      });

  for (const raw of lines) {
    const l = raw.trim().replace(/\s+/g, " ");
    if (!l || l.startsWith("*")) continue;
    const field = l.match(/^(?:01|05|10|77)\s+([A-Z0-9-]+)\s+PIC\s+([^.\s]+)/i);
    if (field) {
      const numeric = /9|V/.test(field[2]) && !/X/.test(field[2]);
      fields.push(`  ${camel(field[1])}: ${numeric ? "number" : "string"}; // PIC ${field[2]}`);
      continue;
    }
    if (/PROCEDURE\s+DIVISION/i.test(l)) {
      inProc = true;
      continue;
    }
    if (!inProc) continue;
    const para = l.match(/^([A-Z0-9-]+)\.$/i);
    if (para && !/^(END-\w+|ELSE|EXIT|GOBACK)$/i.test(para[1])) {
      if (current) out.push("}\n");
      current = para[1];
      paragraphs.push(current);
      depth = 1;
      out.push(`export function ${camel(current)}(d: Dados): void {`);
      continue;
    }
    const s = l.replace(/\.$/, "");
    let m;
    if ((m = s.match(/^IF\s+(.+)$/i))) {
      rules.push({ onde: current, regra: `Condição: ${m[1]}` });
      out.push(`${ind()}if (${expr(m[1])}) {`);
      depth++;
    } else if (/^ELSE$/i.test(s)) {
      out.push(`${"  ".repeat(depth - 1)}} else {`);
    } else if (/^END-IF$/i.test(s)) {
      depth = Math.max(1, depth - 1);
      out.push(`${ind()}}`);
    } else if ((m = s.match(/^COMPUTE\s+([A-Z0-9-]+)(\s+ROUNDED)?\s*=\s*(.+)$/i))) {
      rules.push({ onde: current, regra: `Cálculo${m[2] ? " (arredondado)" : ""}: ${m[1]} = ${m[3]}` });
      const v = m[2] ? `Math.round((${expr(m[3])}) * 100) / 100` : expr(m[3]);
      out.push(`${ind()}d.${camel(m[1])} = ${v};`);
    } else if ((m = s.match(/^MOVE\s+(.+?)\s+TO\s+([A-Z0-9-]+)$/i))) {
      const v = /^['"]/.test(m[1]) || /^-?\d/.test(m[1]) ? m[1].replace(/'/g, '"') : `d.${camel(m[1])}`;
      out.push(`${ind()}d.${camel(m[2])} = ${v};`);
    } else if ((m = s.match(/^PERFORM\s+([A-Z0-9-]+)$/i))) {
      out.push(`${ind()}${camel(m[1])}(d);`);
    } else if ((m = s.match(/^DISPLAY\s+(.+)$/i))) {
      const parts = m[1].match(/'[^']*'|"[^"]*"|[A-Z0-9-]+/gi) ?? [];
      const args = parts.map((p) => (/^['"]/.test(p) ? JSON.stringify(p.slice(1, -1)) : `d.${camel(p)}`));
      out.push(`${ind()}console.log(${args.join(", ")});`);
    } else if (/^(STOP RUN|GOBACK)$/i.test(s)) {
      out.push(`${ind()}return;`);
    } else {
      out.push(`${ind()}// TODO revisar manualmente: ${s}`);
    }
    // Em COBOL, o ponto final encerra a sentença e todos os IFs abertos
    if (l.endsWith(".")) while (depth > 1) {
      depth--;
      out.push(`${ind()}}`);
    }
  }
  if (current) out.push("}");
  const ts = [`// Gerado automaticamente a partir de COBOL — revisar antes de usar em produção`, `export type Dados = {`, ...fields, `};`, ``, ...out].join("\n");
  return { rules, ts, fields, paragraphs };
}

export async function analyzeLegacy(fileName: string, code: string, target: string, opts: { call?: AiCall } = {}): Promise<LegacyResult> {
  const language = detectLanguage(fileName, code);
  const linesOfCode = code.split(/\r?\n/).filter((l) => l.trim() && !/^\s*(\*|\/\/|'|\{)/.test(l)).length;

  const call = pickAi(opts.call);
  let fallback: { aiStatus: AiStatus; aiDetail?: string; provider: string } = { aiStatus: "desligada", provider: "demo" };
  if (call) {
    const r = await call<{ summary: string; rules: Rule[]; modernCode: string }>(
      "Você é especialista em modernização de sistemas bancários legados. Explique o código de forma clara para analistas de negócio, extraia as regras de negócio e gere uma versão moderna equivalente, idiomática e comentada.",
      `Linguagem de origem: ${language}. Linguagem de destino: ${target}.
Retorne JSON: {"summary": string (explicação em português), "rules": [{"onde": nome da rotina, "regra": regra de negócio em português}], "modernCode": string}

Código (${fileName}):
${code}`,
      [],
      { validate: isLegacyShape },
    );
    if (r.ok) {
      const { summary, rules, modernCode } = r.data;
      return { language, linesOfCode, summary, rules: rules.map(({ onde, regra }) => ({ onde, regra })), modernCode, provider: "claude", aiStatus: "usada" };
    }
    // Forma inválida é rejeição; rede/HTTP/JSON é falha. Nos dois casos segue o fluxo determinístico.
    fallback = { aiStatus: r.reason === "forma" ? "rejeitada" : "falhou", aiDetail: `${r.reason}: ${r.detail}`.slice(0, 300), provider: "demo-fallback" };
  }

  if (language === "COBOL") {
    const { rules, ts, fields, paragraphs } = cobolToTs(code);
    const programId = code.match(/PROGRAM-ID\.\s*([A-Z0-9-]+)/i)?.[1] ?? fileName;
    return {
      language,
      linesOfCode,
      summary: `Programa ${programId} em COBOL com ${linesOfCode} linhas úteis, ${fields.length} campo(s) de dados e ${paragraphs.length} rotina(s) (${paragraphs.join(", ") || "nenhuma"}). Foram identificadas ${rules.length} regra(s) de negócio (condições e cálculos). Conversão local (sem IA): tradução estrutural automática para TypeScript; com a IA ativa, o resumo e a conversão ficam completos e idiomáticos.`,
      rules,
      modernCode: target === "TypeScript" ? ts : `// Conversão local (sem IA) converte apenas para TypeScript.\n\n${ts}`,
      ...fallback,
    };
  }

  return {
    language,
    linesOfCode,
    summary: `Arquivo em ${language} com ${linesOfCode} linhas úteis. Na conversão local (sem IA), a conversão automática cobre apenas COBOL. Configure a chave da IA para analisar ${language}.`,
    rules: [],
    modernCode: "",
    ...fallback,
  };
}
