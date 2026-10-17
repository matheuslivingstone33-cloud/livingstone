"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function ErrorBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const msg = params.get("erro");
  if (!msg) return null;
  const close = () => {
    const p = new URLSearchParams(params);
    p.delete("erro");
    router.replace(p.size ? `${path}?${p}` : path);
  };
  return (
    <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{msg}</span>
      <button type="button" onClick={close} className="shrink-0 font-medium hover:underline">
        Fechar
      </button>
    </div>
  );
}
