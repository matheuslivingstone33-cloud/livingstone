import { StatusBadge } from "@/components/ui";

const BADGE: Record<string, string> = { usada: "IA_USADA", rejeitada: "IA_REJEITADA", falhou: "IA_FALHOU" };

/** Selo de qual versão está na tela e, quando a IA foi usada, a versão determinística para conferência. */
export function AiVersion({ status, base, label = "Ver versão padrão (sem IA)" }: { status?: string | null; base?: string | null; label?: string }) {
  const badge = status ? BADGE[status] : undefined;
  if (!badge) return null;
  return (
    <div className="mt-3 space-y-2">
      <StatusBadge status={badge} />
      {status === "usada" && base && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-600">{label}</summary>
          <pre className="mt-2 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper p-3 font-sans text-xs leading-relaxed text-ink-800">{base}</pre>
        </details>
      )}
    </div>
  );
}
