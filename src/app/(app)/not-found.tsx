import Link from "next/link";

export default function NotFound() {
  return (
    <section className="card mx-auto mt-6 max-w-xl text-center">
      <p className="eyebrow mb-3">Erro 404</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">Página não encontrada</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">
        O endereço não existe ou o registro não pertence à sua instituição.
      </p>
      <div className="mt-6">
        <Link href="/dashboard" className="btn">Voltar ao painel</Link>
      </div>
    </section>
  );
}
