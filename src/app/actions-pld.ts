"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireSession, type Session } from "@/lib/auth";
import { aiProvider } from "@/lib/ai";
import { DOSSIER_AI_WINDOW_MS, analyzeClient, buildDossier, groupByClient, parseTransactionsCsv, scoreOf, type Alert } from "@/lib/pld";
import { buildIndex, parseList } from "@/lib/lists";
import { getSettings } from "@/lib/settings";
import { decodeText, readUpload } from "@/lib/upload";
import { fail } from "@/lib/errors";

const MANDATORY_RULES = ["ESPECIE_50K", "CLIENTE_LISTA_RESTRITIVA"];

export async function importPld(form: FormData) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const f = await readUpload(form.get("file"), ["text"]).catch((e: Error) => fail("/pld", e.message));
  if (!f) fail("/pld", "Envie o arquivo de transações (CSV).");
  const txs = parseTransactionsCsv(decodeText(f.data));
  if (!txs.length) fail("/pld", "Nenhuma transação válida. Confira as colunas: data; cliente; cpf_cnpj; tipo; valor.");
  if (txs.length > 500_000) fail("/pld", "Arquivo grande demais: divida em lotes de até 500 mil transações.");

  const cfg = (await getSettings(s.orgId)).pld;
  const lists = buildIndex(
    (await db.restrictedEntry.findMany({ where: { orgId: s.orgId } })).map((e) => ({ ...e, document: e.document ?? undefined, reason: e.reason ?? undefined })),
  );
  const ANALYSIS_DAYS = cfg.analysisDays; // prazo de análise a partir da seleção (Circular 3.978, art. 43)
  const times = txs.map((t) => t.date.getTime());
  const clients = groupByClient(txs);
  const results = [...clients.values()].map((list) => {
    const alerts = analyzeClient(list, cfg, lists);
    return { list, alerts, ...scoreOf(alerts), mandatory: alerts.some((a) => MANDATORY_RULES.includes(a.rule)) };
  });
  const flagged = results.filter((r) => r.score >= cfg.caseMinScore || r.mandatory);

  const batch = await db.pldBatch.create({
    data: {
      orgId: s.orgId,
      fileName: f.name,
      transactions: txs.length,
      clients: clients.size,
      alerts: flagged.reduce((a, r) => a + r.alerts.length, 0),
      periodStart: new Date(Math.min(...times)),
      periodEnd: new Date(Math.max(...times)),
    },
  });
  await db.pldTransaction.createMany({
    data: txs.map((t) => ({
      batchId: batch.id,
      date: t.date,
      clientDoc: t.clientDoc,
      clientName: t.clientName,
      type: t.type,
      direction: t.direction,
      amount: t.amount,
      counterparty: t.counterparty,
      counterDoc: t.counterDoc,
    })),
  });
  const sum = (l: typeof txs, dir: "C" | "D") => l.filter((t) => t.direction === dir).reduce((a, t) => a + t.amount, 0);
  for (const r of flagged) {
    const first = r.list[0];
    await db.pldCase.create({
      data: {
        orgId: s.orgId,
        batchId: batch.id,
        clientDoc: first.clientDoc,
        clientName: first.clientName,
        declaredIncome: first.income,
        pep: first.pep || r.alerts.some((a) => a.rule === "PEP"),
        score: r.score,
        risk: r.risk,
        alerts: r.alerts,
        totalIn: sum(r.list, "C"),
        totalOut: sum(r.list, "D"),
        mandatory: r.mandatory,
        dueAt: new Date(Date.now() + ANALYSIS_DAYS * 86_400_000),
      },
    });
  }
  await audit(s, "pld.importar", `${f.name}: ${txs.length} transações, ${clients.size} clientes, ${flagged.length} casos abertos`);
  revalidatePath("/pld");
  redirect(`/pld?lote=${batch.id}`);
}

const SOURCES = ["CSNU", "OFAC", "PEP", "INTERNA"];

// Importa (substitui) uma lista restritiva ou de PEP a partir do arquivo oficial
export async function importRestrictedList(form: FormData) {
  const s = await requireSession(["ADMIN"]);
  const back = "/configuracoes";
  const source = String(form.get("source"));
  if (!SOURCES.includes(source)) fail(back, "Escolha a origem da lista.");
  const f = await readUpload(form.get("file"), ["text"]).catch((e: Error) => fail(back, e.message));
  if (!f) fail(back, "Envie o arquivo da lista.");
  const entries = parseList(source, decodeText(f.data));
  if (!entries.length) fail(back, `Nenhum registro reconhecido no arquivo para a lista ${source}. Confira o formato.`);

  await db.$transaction([
    db.restrictedEntry.deleteMany({ where: { orgId: s.orgId, source } }),
    db.restrictedEntry.createMany({ data: entries.map((e) => ({ ...e, orgId: s.orgId })) }),
  ]);
  await audit(s, "pld.lista_importar", `${source}: ${entries.length} registros (${f.name})`);
  revalidatePath(back);
  redirect(`${back}?lista=${source}&n=${entries.length}`);
}

async function loadCase(orgId: string, id: string) {
  const c = await db.pldCase.findFirst({ where: { id, orgId }, include: { batch: true } });
  if (!c) fail("/pld", "Caso não encontrado.");
  return c;
}


async function runDossier(s: Session, caseId: string, force: boolean) {
  const c = await loadCase(s.orgId, caseId);
  const recent = !!c.dossierAiAt && Date.now() - c.dossierAiAt.getTime() < DOSSIER_AI_WINDOW_MS;
  const useAi = aiProvider() === "claude" && (force || !recent);
  const d = await buildDossier(
    {
      clientName: c.clientName,
      clientDoc: c.clientDoc,
      declaredIncome: c.declaredIncome ? Number(c.declaredIncome) : null,
      pep: c.pep,
      periodStart: c.batch.periodStart,
      periodEnd: c.batch.periodEnd,
      totalIn: Number(c.totalIn),
      totalOut: Number(c.totalOut),
      alerts: c.alerts as unknown as Alert[],
      score: c.score,
    },
    { useAi },
  );
  // Fora da janela sem IA: mantém a última versão aprovada da IA, se ela ainda confere com a base atual
  const keepAi = !useAi && c.dossierAiText && c.dossierBase === d.base ? c.dossierAiText : undefined;
  const shown = d.aiText ?? keepAi ?? d.base;
  await db.pldCase.update({
    where: { id: c.id },
    data: {
      dossier: shown,
      dossierBase: d.base,
      // claude = IA conferida na tela; ia-rejeitada/ia-falhou = padrão exibido após tentativa; demo = sem IA
      dossierAi: d.aiText || keepAi ? "claude" : useAi && d.provider === "claude" ? `ia-${d.aiStatus}` : recent && c.dossierAi?.startsWith("ia-") ? c.dossierAi : "demo",
      ...(useAi ? { dossierAiAt: new Date(), dossierAiText: d.aiText ?? null } : {}),
    },
  });
  const status = useAi ? d.aiStatus : recent && aiProvider() === "claude" ? "janela_24h" : "desligada";
  await audit(s, "pld.dossie", `${c.clientName} (${c.clientDoc}) · IA: ${status}${force ? " (regeneração forçada)" : ""}${d.aiDetail ? ` · ${d.aiDetail}` : ""}`.slice(0, 500));
  revalidatePath(`/pld/${c.id}`);
}

export async function generateDossier(caseId: string) {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  await runDossier(s, caseId, false);
}

export async function regenerateDossierAi(caseId: string) {
  const s = await requireSession(["ADMIN"]);
  await runDossier(s, caseId, true);
}

export type DecideState = { error?: string };

export async function decideCase(caseId: string, _prev: DecideState, form: FormData): Promise<DecideState> {
  const s = await requireSession(["ADMIN", "ANALISTA"]);
  const c = await loadCase(s.orgId, caseId);
  if (c.status !== "EM_ANALISE") return { error: "Este caso já foi decidido." };
  const decision = String(form.get("decision"));
  const justification = String(form.get("justification") ?? "").trim().slice(0, 5000);
  const protocol = String(form.get("protocol") ?? "").trim().slice(0, 40);
  if (protocol && !/^[\w.\-/]{5,40}$/.test(protocol)) return { error: "Protocolo do SISCOAF em formato inválido." };

  if (!["ARQUIVADO", "COMUNICADO"].includes(decision)) return { error: "Escolha a decisão." };
  if (justification.length < 30) return { error: "A justificativa precisa ter ao menos 30 caracteres (fica registrada para auditoria e para o Banco Central)." };
  if (decision === "ARQUIVADO" && c.mandatory)
    return { error: "Caso de comunicação obrigatória (espécie acima do limite ou cliente em lista de sanções): não pode ser arquivado." };
  if (decision === "COMUNICADO" && !protocol) return { error: "Informe o número do protocolo gerado no SISCOAF." };
  if (c.pep && s.role !== "ADMIN") return { error: "Cliente PEP: a decisão exige perfil de Administrador (aprovação de nível superior)." };

  // Condicional: duas decisões simultâneas não sobrescrevem uma à outra
  const { count } = await db.pldCase.updateMany({
    where: { id: c.id, status: "EM_ANALISE" },
    data: { status: decision, decision: justification, protocol: protocol || null, decidedBy: s.name, decidedAt: new Date() },
  });
  if (!count) return { error: "Este caso acabou de ser decidido por outra pessoa." };
  await audit(s, decision === "COMUNICADO" ? "pld.comunicar_coaf" : "pld.arquivar", `${c.clientName} (${c.clientDoc})${protocol ? ` · protocolo ${protocol}` : ""}`);
  revalidatePath("/pld");
  redirect(`/pld/${c.id}`);
}
