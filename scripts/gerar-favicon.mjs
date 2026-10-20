// Gera src/app/favicon.ico (16, 32 e 48 px) e src/app/apple-icon.png a partir de src/app/icon.svg.
// O .ico guarda PNGs dentro (formato aceito por todos os navegadores atuais).
// Uso: node scripts/gerar-favicon.mjs
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("src/app/icon.svg");
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => sharp(svg, { density: 72 * (s / 32) * 4 }).resize(s, s).png().toBuffer()));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...entries, ...pngs]));

// Ícone da tela inicial do iPhone: sem transparência, com margem
await sharp({ create: { width: 180, height: 180, channels: 3, background: "#0f766e" } })
  .composite([{ input: await sharp(svg, { density: 72 * 5 }).resize(180, 180).png().toBuffer() }])
  .png()
  .toFile("src/app/apple-icon.png");
console.log("favicon.ico e apple-icon.png gerados");
