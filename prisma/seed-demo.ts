// Popula a organização de demonstração com movimento realista (PLD, acordos pagos ao longo das semanas),
// para o painel e as telas não aparecerem vazios numa apresentação. Pode rodar mais de uma vez.
// Uso: npm run db:demo   (rode antes: npm run setup)
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { analyzeClient, groupByClient, parseTransactionsCsv, scoreOf } from "../src/lib/pld";
import { buildIndex } from "../src/lib/lists";
import { DEFAULTS } from "../src/lib/settings";

const db = new PrismaClient();
const DAY = 86_400_000;
const MANDATORY_RULES = ["ESPECIE_50K", "CLIENTE_LISTA_RESTRITIVA"];

async function pld(orgId: string) {
  if (await db.pldBatch.count({ where: { orgId } })) return console.log("PLD: já existe, pulando");
  const txs = parseTransactionsCsv(readFileSync(new URL("../public/demo/transacoes_pld.csv", import.meta.url), "utf8"));
  const cfg = DEFAULTS.pld;
  const lists = buildIndex((await db.restrictedEntry.findMany({ where: { orgId } })).map((e) => ({ ...e, document: e.document ?? undefined, reason: e.reason ?? undefined })));
  const times = txs.map((t) => t.date.getTime());
  const clients = groupByClient(txs);
  const results = [...clients.values()].map((list) => {
    const alerts = analyzeClient(list, cfg, lists);
    return { list, alerts, ...scoreOf(alerts), mandatory: alerts.some((a) => MANDATORY_RULES.includes(a.rule)) };
  });
  const flagged = results.filter((r) => r.score >= cfg.caseMinScore || r.mandatory);
  const batch = await db.pldBatch.create({
    data: {
      orgId,
      fileName: "transacoes_pld.csv",
      transactions: txs.length,
      clients: clients.size,
      alerts: flagged.reduce((a, r) => a + r.alerts.length, 0),
      periodStart: new Date(Math.min(...times)),
      periodEnd: new Date(Math.max(...times)),
    },
  });
  await db.pldTransaction.createMany({
    data: txs.map((t) => ({ batchId: batch.id, date: t.date, clientDoc: t.clientDoc, clientName: t.clientName, type: t.type, direction: t.direction, amount: t.amount, counterparty: t.counterparty, counterDoc: t.counterDoc })),
  });
  const sum = (l: typeof txs, dir: "C" | "D") => l.filter((t) => t.direction === dir).reduce((a, t) => a + t.amount, 0);
  // Prazos escalonados para o painel mostrar urgências diferentes
  const offsets = [6, 12, 21, 30, 38, 44];
  for (const [i, r] of flagged.entries()) {
    const first = r.list[0];
    await db.pldCase.create({
      data: {
        orgId,
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
        dueAt: new Date(Date.now() + (offsets[i % offsets.length] ?? 30) * DAY),
      },
    });
  }
  console.log(`PLD: ${txs.length} transações, ${flagged.length} casos abertos`);
}

async function cobranca(orgId: string) {
  if ((await db.payment.count({ where: { agreement: { debt: { orgId } } } })) >= 6) return console.log("Cobrança: já tem pagamentos, pulando");
  const agreements = await db.agreement.findMany({ where: { debt: { orgId }, status: { in: ["PROPOSTO", "ACEITO"] } }, include: { debt: true }, orderBy: { createdAt: "asc" } });
  // Pagamentos distribuídos nas últimas 8 semanas, crescendo (acordos pagos recentes são mais numerosos)
  const paidDaysAgo = [49, 43, 38, 30, 26, 19, 8, 2];
  let paid = 0;
  for (const [i, a] of agreements.entries()) {
    if (i >= paidDaysAgo.length + 2) {
      // Os últimos contratos ficam parados, para o funil mostrar a carteira inteira:
      // o penúltimo segue com proposta enviada (NEGOCIANDO) e o último volta a "em aberto" (proposta cancelada)
      if (i === agreements.length - 1)
        await db.$transaction([
          db.agreement.update({ where: { id: a.id }, data: { status: "CANCELADO" } }),
          db.debt.update({ where: { id: a.debtId }, data: { status: "EM_ABERTO" } }),
        ]);
      continue;
    }
    if (i < paidDaysAgo.length) {
      const when = new Date(Date.now() - paidDaysAgo[i] * DAY);
      const amount = Number(a.total) * 1.0;
      await db.$transaction([
        db.agreement.update({ where: { id: a.id }, data: { status: "PAGO", acceptedAt: new Date(when.getTime() - DAY), paidAt: when, paidAmount: amount } }),
        db.payment.create({ data: { agreementId: a.id, amount, paidAt: when, source: i % 2 ? "PIX_WEBHOOK" : "MANUAL", createdBy: "demo" } }),
        db.debt.update({ where: { id: a.debtId }, data: { status: "QUITADO" } }),
      ]);
      paid++;
    } else {
      await db.$transaction([
        db.agreement.update({ where: { id: a.id }, data: { status: "ACEITO", acceptedAt: new Date() } }),
        db.debt.update({ where: { id: a.debtId }, data: { status: "ACORDO" } }),
      ]);
    }
  }
  console.log(`Cobrança: ${paid} acordos pagos, ${Math.max(agreements.length - paid, 0)} aceitos`);
}

async function main() {
  const org = await db.organization.findFirstOrThrow({ where: { name: "Cooperativa de Crédito Demo" } });
  await pld(org.id);
  await cobranca(org.id);
}

main().finally(() => db.$disconnect());
