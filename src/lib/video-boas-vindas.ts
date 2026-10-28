// Vídeo de boas-vindas personalizado: aparece no painel só para os e-mails listados.
// VIDEO_BOAS_VINDAS_EMAILS ausente usa o padrão; vazia desliga. Comparação exata, sem caixa.
const PADRAO = "amanda@admin.com";

export function mostraVideoBoasVindas(email: string | null | undefined, env: string | undefined): boolean {
  if (!email) return false;
  const lista = (env ?? PADRAO)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes(email.trim().toLowerCase());
}
