// Teste da cobrança e do Pix: npx tsx scripts/testar-cobranca.mts
import { readFileSync } from "node:fs";
import { crc16, parseDebtsCsv, pixPayload, proposal } from "../src/lib/collection";

// Exemplo oficial do manual do BR Code (Banco Central): o CRC esperado é 1D3D
const ref =
  "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
console.log("CRC do exemplo oficial:", crc16(ref), crc16(ref) === "1D3D" ? "✓" : "✗ ERRO");

process.env.PIX_KEY ??= "pix@cooperativa-demo.local";
const pix = pixPayload(150.5, "ACDTESTE123", "Acordo CT-1");
console.log("Pix gerado:", pix, crc16(pix!.slice(0, -4)) === pix!.slice(-4) ? "✓" : "✗");

const rows = parseDebtsCsv(readFileSync(new URL("../public/demo/carteira_inadimplentes.csv", import.meta.url), "utf8"));
console.log(`\n${rows.length} contratos lidos`);
for (const r of rows) {
  const p = await proposal(r, "http://localhost:3000/acordo/teste");
  console.log(
    r.contract.padEnd(13),
    `${String(p.days).padStart(3)}d`,
    `orig ${r.principal.toFixed(2).padStart(9)}`,
    `atual ${p.total.toFixed(2).padStart(9)}`,
    "→",
    p.options.map((o) => `${o.label} ${o.total.toFixed(2)}`).join(" | "),
    `[rec: ${p.options[p.recommended].label}]`,
  );
}
