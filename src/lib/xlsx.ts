// Gerador mínimo de .xlsx (sem dependências), port em TypeScript de scripts/xlsx-mini.mjs, com formatos numéricos.
import { crc32, deflateRawSync } from "node:zlib";
import { FORMULAS, KPI_CHAVES, LINHAS, kpis, kpisTrimestre, type Kpi, type OpcoesKpi, type Periodo } from "./demonstrativos";

export type ZipEntry = { name: string; data: string | Buffer; declaredSize?: number };

export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, "utf8");
    const comp = deflateRawSync(raw);
    const size = e.declaredSize ?? raw.length;
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(size >>> 0, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(size >>> 0, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Célula: texto, número, booleano, vazia (null), data (serial do Excel), fórmula ou número formatado. */
export type Celula =
  | string
  | number
  | boolean
  | null
  | undefined
  | { date: number }
  | { formula: string }
  | { n: number | null; fmt: "moeda" | "pct" };
export type Aba = { name: string; rows: Celula[][] };

const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const col = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const ESTILO = { data: 1, moeda: 2, pct: 3 } as const;

function celulaXml(c: Celula, ref: string): string {
  if (c === null || c === undefined) return "";
  if (typeof c === "number") return Number.isFinite(c) ? `<c r="${ref}"><v>${c}</v></c>` : "";
  if (typeof c === "boolean") return `<c r="${ref}" t="b"><v>${c ? 1 : 0}</v></c>`;
  if (typeof c === "object" && "date" in c) return `<c r="${ref}" s="${ESTILO.data}"><v>${c.date}</v></c>`;
  if (typeof c === "object" && "formula" in c) return `<c r="${ref}"><f>${esc(c.formula)}</f></c>`;
  if (typeof c === "object" && "fmt" in c) return c.n === null || !Number.isFinite(c.n) ? "" : `<c r="${ref}" s="${ESTILO[c.fmt]}"><v>${c.n}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(c)}</t></is></c>`;
}

export function buildXlsx(sheets: Aba[]): Buffer {
  const sheetXml = (rows: Celula[][]) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => celulaXml(c, `${col(ci)}${ri + 1}`)).join("")}</row>`)
      .join("")}</sheetData></worksheet>`;
  const entries: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "xl/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) })),
  ];
  return buildZip(entries);
}

// ---------- Planilha do Consolidado Financeiro ----------

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const TRIMESTRES = ["T1", "T2", "T3", "T4"];
const KPI_MOEDA = new Set(["ebitda", "ponto_equilibrio"]);

/** Planilha com 3 abas (Dados, KPIs, Fórmulas). Só entram períodos CONFERIDO do ano. */
export function montarPlanilhaConsolidada(ano: number, periodos: Periodo[], opcoes: OpcoesKpi & { idioma?: "pt" | "en" } = {}): Buffer {
  const ok = periodos.filter((p) => p.ano === ano && p.status === "CONFERIDO");
  const doMes = (m: number) => ok.find((p) => p.mes === m);
  const anteriorDe = (m: number) => (m === 1 ? periodos.find((p) => p.ano === ano - 1 && p.mes === 12 && p.status === "CONFERIDO") : doMes(m - 1));
  const tris = [0, 1, 2, 3].map((t) => kpisTrimestre(ok.filter((p) => p.mes > t * 3 && p.mes <= t * 3 + 3), opcoes));
  const kMes = MESES.map((_, i) => {
    const p = doMes(i + 1);
    return p ? kpis(p, anteriorDe(i + 1), opcoes) : null;
  });
  const cab: Celula[] = ["", ...MESES, ...TRIMESTRES];

  const dados: Celula[][] = [
    cab,
    ...LINHAS.map((l) => [
      l.rotulo,
      ...MESES.map((_, i) => ({ n: doMes(i + 1)?.linhas[l.chave] ?? null, fmt: "moeda" as const })),
      ...tris.map((t) => ({ n: t.meses ? (t.linhas[l.chave] ?? null) : null, fmt: "moeda" as const })),
    ]),
  ];

  const formulas = FORMULAS[opcoes.idioma ?? "pt"];
  const nome = (k: string) => formulas.find((f) => f.chave === k)?.nome ?? k;
  const cel = (k: string, v: Kpi | undefined): Celula => ({ n: v?.valor ?? null, fmt: KPI_MOEDA.has(k) ? "moeda" : "pct" });
  const indicadores: Celula[][] = [
    cab,
    ...KPI_CHAVES.map((k) => [nome(k), ...kMes.map((m) => cel(k, m?.[k])), ...tris.map((t) => cel(k, t.meses ? t.kpis[k] : undefined))]),
    ["Situação", ...kMes.map((m) => (m ? "conferido" : null)), ...tris.map((t) => (t.meses ? t.situacao : null))],
  ];

  const abaFormulas: Celula[][] = [["Chave", "Indicador", "Fórmula", "Explicação"], ...formulas.map((f) => [f.chave, f.nome, f.formula, f.explicacao])];

  return buildXlsx([
    { name: "Dados", rows: dados },
    { name: "KPIs", rows: indicadores },
    { name: "Fórmulas", rows: abaFormulas },
  ]);
}
