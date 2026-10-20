// Geometria do símbolo "Encaixe": duas peças em L (dourada e verde) que se encaixam
// formando um quadrado, separadas por frestas diagonais — a conciliação de duas partes.
// Sem imports de propósito: é usada pelo app (Logo.tsx), pelo vídeo (video/Hero.tsx)
// e conferida contra src/app/icon.svg nos testes.
export const LOGO = {
  viewBox: "0 0 32 32",
  fundo: { rx: 9, cor: "#0f766e" },
  borda: { cor: "#ffffff", opacidade: 0.12 },
  // Barra de cima + barra da esquerda; as pontas são cortadas na diagonal x + y = 31
  pecaOuro: { d: "M8 8H23L18 13H13V18L8 23Z", cor: "#e0b84a" },
  // Barra de baixo + barra da direita; pontas na diagonal x + y = 33 (fresta de ~1,4px)
  pecaVerde: { d: "M24 9V24H9L14 19H19V14Z", cor: "#34b59a" },
} as const;
