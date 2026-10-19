"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export function CopyButton({ text, label, className = "btn-ghost" }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <Icon name={done ? "check" : "copy"} size={16} className={done ? "text-emerald-600" : undefined} />
      <span aria-live="polite">{done ? "Copiado!" : label}</span>
    </button>
  );
}
