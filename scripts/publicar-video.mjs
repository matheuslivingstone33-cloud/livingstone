// Copia o vídeo renderizado (out/) para public/video/, que é o que a landing usa.
// Roda no fim de `npm run video:render`, junto com a geração do poster.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/video", { recursive: true });
copyFileSync("out/livingstone-hero.mp4", "public/video/livingstone-hero.mp4");
console.log("Vídeo publicado em public/video/livingstone-hero.mp4");
