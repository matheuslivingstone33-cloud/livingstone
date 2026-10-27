// Máscara de CPF/CNPJ em texto livre. Puro: sem banco nem Next.
import { validCnpj, validCpf } from "./validators";

// Formatado (com pontuação) sempre conta; só dígitos (11 ou 14) só se os dígitos verificadores baterem
export const DOC = /\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|(?<!\d)\d{14}(?!\d)|(?<!\d)\d{11}(?!\d)/g;

export function mascararUm(m: string): string {
  const d = m.replace(/\D/g, "");
  const formatado = /\D/.test(m);
  if (!formatado && !(d.length === 11 ? validCpf(d) : validCnpj(d))) return m;
  // CPF: ***.456.789-** · CNPJ: **.345.678/0001-**
  const [a, b] = d.length === 11 ? [3, 9] : [2, 12];
  let k = 0;
  return m.replace(/\d/g, (c) => {
    const x = k++;
    return x < a || x >= b ? "*" : c;
  });
}

/** Mascara tudo o que parece CPF ou CNPJ, mantendo os dígitos do meio. */
export const mascararDocs = (s: string) => s.replace(DOC, mascararUm);
