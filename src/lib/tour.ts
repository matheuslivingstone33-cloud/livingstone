// Tour público: roda as libs puras sobre os arquivos de public/demo/ e devolve dados prontos para a tela.
// Sem banco, sem sessão, sem IA: o resultado é sempre o mesmo para os mesmos arquivos.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseBankFile, parseExpectedCsv, reconcileWith, summarize } from "./reconcile";
import { bandOf, buildOptions, parseDebtsCsv, updateDebt } from "./collection";
import { analyzeClient, groupByClient, parseTransactionsCsv, scoreOf } from "./pld";
import { DEFAULTS } from "./settings-defaults";

/** Data de referência fixa: os dias de atraso e encargos não mudam conforme o dia em que a página é aberta. */
export const TOUR_REFERENCE_DATE = new Date(Date.UTC(2026, 9, 15));

/** Opções de conciliação mostradas no tour (tolerância de 2 centavos e casamento por valor e data). */
export const TOUR_RECONCILE = { toleranciaCentavos: 2, casarPorValorData: true, toleranciaDias: 3 };

const readDemo = (file: string, dir: string) => readFileSync(path.join(dir, file), "utf8");

export function buildTourData(demoDir = path.join(process.cwd(), "public", "demo")) {
  // Conciliação: títulos esperados x retorno CNAB 400
  const expected = parseExpectedCsv(readDemo("titulos_esperados.csv", demoDir));
  const bank = parseBankFile("retorno_cnab400.ret", readDemo("retorno_cnab400.ret", demoDir));
  const items = reconcileWith(expected, bank.entries, TOUR_RECONCILE);
  const conciliacao = {
    format: bank.format,
    expectedCount: expected.length,
    receivedCount: bank.entries.length,
    received: Math.round(bank.entries.reduce((a, e) => a + e.amount * 100, 0)) / 100,
    summary: summarize(items),
    items,
  };

  // Cobrança: carteira de inadimplentes com encargos e opções de acordo na data de referência
  const debts = parseDebtsCsv(readDemo("carteira_inadimplentes.csv", demoDir)).map((d) => {
    const u = updateDebt(d.principal, d.dueDate, TOUR_REFERENCE_DATE, DEFAULTS.collection);
    return {
      contract: d.contract,
      debtor: d.debtor,
      product: d.product,
      principal: d.principal,
      dueDate: d.dueDate,
      ...u,
      band: bandOf(u.days, DEFAULTS.collection.bands).label,
      options: buildOptions(u.total, d.principal, u.days, DEFAULTS.collection),
    };
  });
  const cobranca = {
    debts,
    totalPrincipal: Math.round(debts.reduce((a, d) => a + d.principal * 100, 0)) / 100,
    totalUpdated: Math.round(debts.reduce((a, d) => a + d.total * 100, 0)) / 100,
  };

  // PLD: regras de monitoramento por cliente
  const txs = parseTransactionsCsv(readDemo("transacoes_pld.csv", demoDir));
  const clients = [...groupByClient(txs).values()]
    .map((list) => {
      const alerts = analyzeClient(list, DEFAULTS.pld);
      return { clientName: list[0].clientName, txCount: list.length, alerts, ...scoreOf(alerts) };
    })
    .sort((a, b) => b.score - a.score || a.clientName.localeCompare(b.clientName, "pt-BR"));
  const pld = { txCount: txs.length, clients, alertCount: clients.reduce((a, c) => a + c.alerts.length, 0) };

  return { referenceDate: TOUR_REFERENCE_DATE, conciliacao, cobranca, pld };
}

export type TourData = ReturnType<typeof buildTourData>;
