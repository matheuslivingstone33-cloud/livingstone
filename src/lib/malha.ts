// Lógica pura do fundo "malha de transações" do hero: pontos que acendem nos
// cruzamentos da grade de 44px (.bg-grid). Sem imports e sem Math.random/data,
// para o sorteio ser determinístico e testável.

export type Ponto = { x: number; y: number };
export type Pulso = Ponto & { cor: "brand" | "ouro" };

// Centro dos cruzamentos: as linhas de 1px da grade começam em 0, 44, 88...
export function pontosDaGrade(largura: number, altura: number, passo = 44): Ponto[] {
  const pts: Ponto[] = [];
  for (let x = 0; x < largura; x += passo) {
    for (let y = 0; y < altura; y += passo) pts.push({ x: x + 0.5, y: y + 0.5 });
  }
  return pts;
}

// PRNG mulberry32: mesma semente, mesma sequência
export function criarSorteio(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cerca de 8% dos pulsos em dourado; o resto em verde
export function proximoPulso(rng: () => number, pontos: readonly Ponto[], chanceOuro = 0.08): Pulso | null {
  if (pontos.length === 0) return null;
  const p = pontos[Math.floor(rng() * pontos.length)];
  return { ...p, cor: rng() < chanceOuro ? "ouro" : "brand" };
}

// Sobe e desce suavemente: 0 no início e no fim, 1 no meio
export function intensidade(t: number, dur: number) {
  if (t <= 0 || t >= dur) return 0;
  return Math.sin((t / dur) * Math.PI) ** 2;
}
