// Regra de senha em um só lugar, sem imports: o servidor valida com ela e o navegador
// usa a mesma lista para mostrar cada regra enquanto a pessoa digita.

export type PasswordRule = { id: "tamanho" | "letrasNumeros" | "previsivel"; label: string; ok: boolean };

const OBVIAS = /123456|senha|password|qwerty/i;

export function passwordRules(p: string): PasswordRule[] {
  return [
    { id: "tamanho", label: "Ao menos 12 caracteres", ok: p.length >= 12 },
    { id: "letrasNumeros", label: "Letras e números", ok: /[a-z]/i.test(p) && /\d/.test(p) },
    { id: "previsivel", label: "Sem sequência óbvia (123456, senha, qwerty) nem caractere repetido", ok: p.length > 0 && !/^(.)\1+$/.test(p) && !OBVIAS.test(p) },
  ];
}

export function passwordProblem(p: string): string | null {
  if (p.length < 12) return "A senha precisa ter ao menos 12 caracteres.";
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) return "A senha precisa ter letras e números.";
  if (/^(.)\1+$/.test(p) || OBVIAS.test(p)) return "Senha muito previsível: evite sequências como 123456, senha ou qwerty.";
  return null;
}
