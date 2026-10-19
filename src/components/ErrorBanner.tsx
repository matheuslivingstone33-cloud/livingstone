"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";

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
    <div role="alert" className="notice notice-danger mb-6 items-center">
      <Icon name="alert" className="shrink-0 text-red-700" />
      <span className="flex-1">{msg}</span>
      <button type="button" onClick={close} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-medium hover:bg-red-100">
        <Icon name="close" size={14} />
        Fechar
      </button>
    </div>
  );
}
