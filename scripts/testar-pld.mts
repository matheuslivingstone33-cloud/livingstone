// Teste do motor de regras de PLD: npx tsx scripts/testar-pld.mts
import { readFileSync } from "node:fs";
import { analyzeClient, groupByClient, parseTransactionsCsv, scoreOf } from "../src/lib/pld";

const txs = parseTransactionsCsv(readFileSync(new URL("../public/demo/transacoes_pld.csv", import.meta.url), "utf8"));
const clients = groupByClient(txs);
console.log(`${txs.length} transações, ${clients.size} clientes\n`);
for (const list of clients.values()) {
  const alerts = analyzeClient(list);
  const { score, risk } = scoreOf(alerts);
  console.log(`${list[0].clientName.padEnd(28)} score ${String(score).padStart(3)} ${risk.padEnd(5)} ${alerts.map((a) => a.rule).join(", ") || "—"}`);
}
