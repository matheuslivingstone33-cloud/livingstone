import { redirect } from "next/navigation";

// Volta para a página com uma mensagem de erro legível (exibida pelo ErrorBanner).
// Em produção o Next esconde mensagens de exceções; assim o usuário sabe o que corrigir.
export function fail(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erro=${encodeURIComponent(message.slice(0, 300))}`);
}
