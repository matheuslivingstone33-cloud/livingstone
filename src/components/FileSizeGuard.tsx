"use client";
// Avisa no navegador quando os arquivos passam do limite de envio. Sem JS nada muda: o servidor confere de novo.
import { useEffect, useRef, useState } from "react";
import { checkUploadSizes } from "@/lib/upload-limits";

export function FileSizeGuard({ inputIds }: { inputIds: string[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState<string | null>(null);
  const key = inputIds.join(",");

  useEffect(() => {
    const inputs = key
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLInputElement => el instanceof HTMLInputElement);
    const check = () => checkUploadSizes(inputs.flatMap((i) => Array.from(i.files ?? []).map((f) => ({ name: f.name, size: f.size }))));
    const onChange = () => setError(check());
    const form = ref.current?.closest("form");
    const onSubmit = (e: Event) => {
      const err = check();
      setError(err);
      if (err) e.preventDefault();
    };
    inputs.forEach((i) => i.addEventListener("change", onChange));
    form?.addEventListener("submit", onSubmit);
    return () => {
      inputs.forEach((i) => i.removeEventListener("change", onChange));
      form?.removeEventListener("submit", onSubmit);
    };
  }, [key]);

  return (
    <span ref={ref} className="block">
      {error && (
        <span role="alert" className="block text-sm text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
