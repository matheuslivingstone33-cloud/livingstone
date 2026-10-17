// Importação de listas restritivas e de PEP a partir dos arquivos oficiais.
// CSNU: XML consolidado do Conselho de Segurança da ONU (scsanctions.un.org) — base da Lei 13.810/2019.
// OFAC: sdn.csv do Tesouro dos EUA (sanctionslist.ofac.treas.gov).
// PEP: CSV da CGU no Portal da Transparência (CPF vem mascarado: ***.123.456-**).
// INTERNA: CSV próprio da instituição com colunas nome;documento;motivo.

export type ListEntry = { source: string; name: string; nameKey: string; document?: string; reason?: string };

export const nameKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(LTDA|ME|EPP|SA|S A|EIRELI|DE|DA|DO|DAS|DOS|E)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const digits = (s = "") => s.replace(/\D/g, "");

function csvRows(text: string): string[][] {
  // CSV com aspas e separador ; ou ,
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const norm = (h: string) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

export function parseList(source: string, text: string): ListEntry[] {
  const entry = (name: string, document?: string, reason?: string): ListEntry | null =>
    name.trim() ? { source, name: name.trim().slice(0, 300), nameKey: nameKey(name), document: digits(document) || undefined, reason: reason?.trim().slice(0, 300) } : null;

  if (source === "CSNU") {
    const out: ListEntry[] = [];
    for (const m of text.matchAll(/<(INDIVIDUAL|ENTITY)>([\s\S]*?)<\/\1>/g)) {
      const b = m[2];
      const tag = (t: string) => b.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1]?.trim() ?? "";
      const name = [tag("FIRST_NAME"), tag("SECOND_NAME"), tag("THIRD_NAME"), tag("FOURTH_NAME")].filter(Boolean).join(" ");
      const e = entry(name, undefined, `CSNU ${tag("REFERENCE_NUMBER")} ${tag("UN_LIST_TYPE")}`.trim());
      if (e) out.push(e);
      for (const a of b.matchAll(/<ALIAS_NAME>([^<]+)<\/ALIAS_NAME>/g)) {
        const al = entry(a[1], undefined, `CSNU ${tag("REFERENCE_NUMBER")} (alias)`);
        if (al) out.push(al);
      }
    }
    return out;
  }

  const rows = csvRows(text);
  if (source === "OFAC") {
    // sdn.csv não tem cabeçalho: ent_num, SDN_Name, SDN_Type, Program, ...
    return rows.flatMap((r) => {
      const e = r[1] && r[1] !== "-0-" ? entry(r[1], undefined, `OFAC ${r[3] ?? ""}`) : null;
      return e ? [e] : [];
    });
  }

  const [header, ...body] = rows;
  const keys = (header ?? []).map(norm);
  const col = (...names: string[]) => keys.findIndex((k) => names.some((n) => k.includes(n)));

  if (source === "PEP") {
    const iCpf = col("cpf");
    const iNome = col("nomepep", "nome");
    const iFun = col("descricaofuncao", "funcao");
    const iOrg = col("nomeorgao", "orgao");
    return body.flatMap((r) => {
      const e = entry(r[iNome] ?? "", r[iCpf], ["PEP", r[iFun], r[iOrg]].filter(Boolean).join(" · "));
      return e ? [e] : [];
    });
  }

  const iNome = col("nome", "razaosocial");
  const iDoc = col("documento", "cpf", "cnpj");
  const iMot = col("motivo", "observacao");
  return body.flatMap((r) => {
    const e = entry(r[iNome] ?? "", iDoc >= 0 ? r[iDoc] : undefined, iMot >= 0 ? r[iMot] : "Lista interna");
    return e ? [e] : [];
  });
}

// Busca em memória: documento completo, CPF mascarado da CGU (6 dígitos centrais + nome) ou nome exato normalizado
export type ListIndex = { match(doc: string | undefined, name: string | undefined): ListEntry | undefined };

export function buildIndex(entries: ListEntry[]): ListIndex {
  const byDoc = new Map<string, ListEntry>();
  const byName = new Map<string, ListEntry[]>();
  for (const e of entries) {
    if (e.document && e.document.length >= 11) byDoc.set(e.document, e);
    byName.set(e.nameKey, [...(byName.get(e.nameKey) ?? []), e]);
  }
  return {
    match(doc, name) {
      const d = digits(doc);
      if (d && byDoc.has(d)) return byDoc.get(d);
      if (!name) return undefined;
      const cands = byName.get(nameKey(name));
      if (!cands) return undefined;
      // Nome igual: confirma pelo trecho de CPF quando a lista traz CPF mascarado (6 dígitos centrais)
      for (const c of cands) {
        if (!c.document) return c;
        if (c.document.length === 6 && d.length === 11 && d.slice(3, 9) === c.document) return c;
      }
      return undefined;
    },
  };
}
