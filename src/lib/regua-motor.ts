// Execução da régua de cobrança de uma instituição (COM banco; só no servidor). Chamada pelo cron e pelo botão "Executar régua agora".
// Regras puras em ./regua. Toda consulta filtra por orgId. Nada de texto de mensagem nem telefone é gravado ou auditado.
import { db } from "./db";
import { auditRaw } from "./auth";
import { getSettings } from "./settings";
import { appUrl } from "./payments";
import { batchAiTimeout, fmt } from "./collection";
import { outOfBudget } from "./pix-webhook";
import { diaSP, inicioDoDiaSP, fmtData } from "./tz";
import { createProposal, type Ator } from "./cobranca-proposta";
import type { Sender } from "./canal";
import {
  FALHA_DEFINITIVA,
  FALHA_TEMPORARIA,
  PROCESSANDO_INCERTO_MS,
  debtorKey,
  decidir,
  dentroDaJanela,
  etapaConcluida,
  etapaDevida,
  normalizarTelefoneBR,
  textoEtapa,
  type Etapa,
} from "./regua";

/** Trava da execução na instituição: cobre os 60 s da função com folga. */
export const REGUA_LOCK_MS = 70_000;
/** Espaço entre envios, para não disparar em rajada no WhatsApp. */
export const REGUA_ESPACO_MS = 300;
const BREAKER_LIMIT = 3;

export type TotaisRegua = {
  propostas: number;
  enviados: number;
  falhas: number;
  ignorados: number;
  desligados: number;
  incertos: number;
  erros: number;
  pulados: Record<string, number>;
  restantes: boolean;
};

export type ResultadoRegua = { ok: true; totais: TotaisRegua } | { ok: false; motivo: "em_andamento" | "desligada" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function executarRegua(orgId: string, ator: Ator, sender: Sender | null, now: Date, deadline: number): Promise<ResultadoRegua> {
  const cfgAll = await getSettings(orgId);
  const cfg = cfgAll.regua;
  if (!cfg.ativa) return { ok: false, motivo: "desligada" };

  const started = Date.now();
  const budget = Math.max(0, deadline - started);
  const lock = await db.organization.updateMany({
    where: { id: orgId, OR: [{ collectionRunLockUntil: null }, { collectionRunLockUntil: { lt: new Date(started) } }] },
    data: { collectionRunLockUntil: new Date(started + REGUA_LOCK_MS) },
  });
  if (!lock.count) return { ok: false, motivo: "em_andamento" };

  const t: TotaisRegua = { propostas: 0, enviados: 0, falhas: 0, ignorados: 0, desligados: 0, incertos: 0, erros: 0, pulados: {}, restantes: false };
  const pular = (m: string) => (t.pulados[m] = (t.pulados[m] ?? 0) + 1);
  const semTempo = () => outOfBudget(started, Date.now(), budget);
  const auditar = (acao: string, detalhe: string) => auditRaw(orgId, ator.userId, acao, detalhe.slice(0, 500), ator.ip).catch(() => undefined);

  try {
    const org = await db.organization.findFirst({ where: { id: orgId }, select: { name: true } });
    const credor = cfgAll.pix.merchant || org?.name || "";

    // 1. Envio que ficou PROCESSANDO há mais de 10 min (função interrompida): resultado incerto, vira exceção e nunca é reenviado
    const incertos = await db.collectionMessage.updateMany({
      where: { orgId, status: "PROCESSANDO", updatedAt: { lt: new Date(now.getTime() - PROCESSANDO_INCERTO_MS) } },
      data: { status: "FALHOU", motivo: "envio_incerto" },
    });
    t.incertos = incertos.count;

    const janela = dentroDaJanela(now, cfg);

    // 2. Proposta D+0 dos contratos em aberto e não pausados (IA dentro do teto; sem IA, mensagem padrão). Só dentro da janela:
    // fora dela a proposta esperaria o dia seguinte e perderia validade à toa.
    if (janela) {
      const abertos = await db.debt.findMany({
        where: { orgId, status: "EM_ABERTO", reguaPausedAt: null },
        select: { id: true },
        orderBy: { dueDate: "asc" },
        take: cfg.maxPorExecucao,
      });
      let seguidas = 0;
      let teto = false;
      for (const d of abertos) {
        if (semTempo()) {
          t.restantes = true;
          break;
        }
        try {
          const useAi = !teto && seguidas < BREAKER_LIMIT;
          const r = await createProposal(ator, d.id, { useAi, timeoutMs: batchAiTimeout(deadline, Date.now()) });
          if (!r.created) continue;
          t.propostas++;
          if (r.aiStatus === "bloqueada_limite") teto = true;
          seguidas = r.aiStatus === "falhou" ? seguidas + 1 : r.aiStatus === "desligada" ? seguidas : 0;
        } catch {
          t.erros++;
        }
      }
      if (teto) await auditar("ia.limite", "Régua de cobrança: teto diário de IA atingido; propostas seguintes com a mensagem padrão");
    }

    // 3. Envios das etapas devidas
    const enviadosHoje = new Set(
      (
        await db.collectionMessage.findMany({
          where: { orgId, status: "ENVIADO", sentAt: { gte: inicioDoDiaSP(diaSP(now)) } },
          select: { debtorKey: true },
        })
      ).map((m) => m.debtorKey),
    );
    const acordos = await db.agreement.findMany({
      where: { status: "PROPOSTO", expiresAt: { gt: now }, debt: { orgId } },
      include: { debt: true, collectionMessages: { select: { id: true, etapa: true, status: true, motivo: true, tentativas: true } } },
      orderBy: { createdAt: "asc" },
    });

    let envios = 0;
    for (const a of acordos) {
      if (semTempo() || envios >= cfg.maxPorExecucao) {
        t.restantes = true;
        break;
      }
      try {
        const concluidas = a.collectionMessages.filter(etapaConcluida).map((m) => m.etapa);
        const { etapa, superadas } = etapaDevida(a, cfg.etapas as Etapa[], concluidas, now);
        const key = debtorKey(orgId, a.debt.document);
        for (const sup of superadas) {
          await db.collectionMessage.createMany({
            data: [{ orgId, debtId: a.debtId, agreementId: a.id, etapa: sup.id, canal: "whatsapp", status: "IGNORADO", motivo: "superada", debtorKey: key }],
            skipDuplicates: true,
          });
          await db.collectionMessage.updateMany({
            where: { orgId, agreementId: a.id, etapa: sup.id, status: { in: ["FALHOU", "DESLIGADO"] }, motivo: { not: "envio_incerto" } },
            data: { status: "IGNORADO", motivo: "superada" },
          });
        }
        if (!etapa) continue;

        const telefone = normalizarTelefoneBR(a.debt.phone);
        const d = decidir({ cfg, debt: a.debt, agreement: a, telefone, now, enviouHoje: enviadosHoje.has(key), temCanal: !!sender });
        const existente = a.collectionMessages.find((m) => m.etapa === etapa.id);

        if (!d.ok) {
          pular(d.motivo);
          if (d.registrar) {
            if (!existente)
              await db.collectionMessage.createMany({
                data: [{ orgId, debtId: a.debtId, agreementId: a.id, etapa: etapa.id, canal: "whatsapp", status: d.registrar, motivo: d.motivo, debtorKey: key }],
                skipDuplicates: true,
              });
            else if (existente.status === "DESLIGADO" && d.registrar === "IGNORADO")
              await db.collectionMessage.updateMany({ where: { id: existente.id, orgId, status: "DESLIGADO" }, data: { status: "IGNORADO", motivo: d.motivo } });
            if (d.registrar === "IGNORADO") t.ignorados++;
            else t.desligados++;
          }
          continue;
        }

        // Reserva atômica do par (acordo, etapa): só um processo envia
        let msgId: string | null = null;
        if (!existente) {
          const novo = await db.collectionMessage
            .create({ data: { orgId, debtId: a.debtId, agreementId: a.id, etapa: etapa.id, canal: sender!.canal, status: "PROCESSANDO", debtorKey: key } })
            .catch(() => null);
          msgId = novo?.id ?? null;
        } else if (existente.status === "DESLIGADO" || existente.status === "FALHOU") {
          const r = await db.collectionMessage.updateMany({
            where: { id: existente.id, orgId, status: existente.status, tentativas: existente.tentativas },
            data: { status: "PROCESSANDO", motivo: null },
          });
          msgId = r.count ? existente.id : null;
        }
        if (!msgId) continue;

        // Recarrega antes de enviar: o devedor pode ter aceitado ou o contrato ter sido pausado durante a execução
        const atual = await db.agreement.findFirst({ where: { id: a.id, debt: { orgId } }, include: { debt: true } });
        const recheck = atual && decidir({ cfg, debt: atual.debt, agreement: atual, telefone, now: new Date(), enviouHoje: false, temCanal: true });
        if (!atual || !recheck || !recheck.ok) {
          await db.collectionMessage.updateMany({ where: { id: msgId, orgId }, data: { status: "IGNORADO", motivo: recheck && !recheck.ok ? recheck.motivo : "mudou_status" } });
          t.ignorados++;
          continue;
        }

        const texto = textoEtapa(etapa.id, {
          mensagemProposta: atual.message,
          devedor: atual.debt.debtor,
          credor,
          valor: fmt(Number(atual.total)),
          link: `${appUrl()}/acordo/${atual.token}`,
          validade: fmtData(atual.expiresAt),
        });
        if (envios > 0) await sleep(REGUA_ESPACO_MS);
        const res = await sender!.enviar(telefone!, texto);
        envios++;
        if (res.ok) {
          await db.collectionMessage.updateMany({
            where: { id: msgId, orgId },
            data: { status: "ENVIADO", sentAt: new Date(), providerId: res.providerId ?? null, motivo: null, tentativas: { increment: 1 } },
          });
          enviadosHoje.add(key);
          t.enviados++;
        } else {
          await db.collectionMessage.updateMany({
            where: { id: msgId, orgId },
            data: { status: "FALHOU", motivo: `${res.transitorio ? FALHA_TEMPORARIA : FALHA_DEFINITIVA}:${res.motivo}`.slice(0, 80), tentativas: { increment: 1 } },
          });
          t.falhas++;
        }
        await auditar("cobranca.regua.envio", `Contrato ${a.debt.contract}: etapa ${etapa.id} · ${res.ok ? "enviado" : `falhou (${res.motivo})`}`);
      } catch {
        // Um contrato com problema não derruba a execução
        t.erros++;
      }
    }
  } finally {
    await db.organization.updateMany({ where: { id: orgId }, data: { collectionRunLockUntil: null } }).catch(() => undefined);
    const pulados = Object.entries(t.pulados)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    await auditar(
      "cobranca.regua.execucao",
      `${ator.userId ? `Execução manual por ${ator.nome}` : "Execução automática"} · propostas ${t.propostas} · enviados ${t.enviados} · falhas ${t.falhas} · ignorados ${t.ignorados} · envio desligado ${t.desligados} · incertos ${t.incertos} · erros ${t.erros}${pulados ? ` · pulados: ${pulados}` : ""}${t.restantes ? " · restantes para a próxima execução" : ""}${sender ? "" : " · sem canal configurado"}`,
    );
  }
  return { ok: true, totais: t };
}
