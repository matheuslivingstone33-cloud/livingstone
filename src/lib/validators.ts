// Validação de CPF e CNPJ pelos dígitos verificadores
const digits = (s: string) => s.replace(/\D/g, "");

export function validCpf(v: string) {
  const d = digits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += +d[i] * (n + 1 - i);
    if (((sum * 10) % 11) % 10 !== +d[n]) return false;
  }
  return true;
}

export function validCnpj(v: string) {
  const d = digits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((a, x, i) => a + x * +d[i], 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return calc(12) === +d[12] && calc(13) === +d[13];
}

export const validDocument = (v: string) => (digits(v).length === 14 ? validCnpj(v) : validCpf(v));
