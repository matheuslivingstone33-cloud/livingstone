// Esqueleto enquanto a página do servidor carrega: mesma estrutura de título e cartões.
export default function Loading() {
  const bar = "rounded-full bg-line animate-pulse motion-reduce:animate-none";
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">Carregando…</p>
      <div aria-hidden="true">
        <div className="mb-8 border-b border-line pb-6">
          <div className={`${bar} mb-4 h-3 w-24`} />
          <div className={`${bar} h-8 w-72 max-w-full`} />
          <div className={`${bar} mt-3 h-3.5 w-96 max-w-full`} />
        </div>
        <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <div className={`${bar} h-2.5 w-20`} />
              <div className={`${bar} mt-4 h-6 w-28`} />
            </div>
          ))}
        </div>
        <div className="card space-y-4">
          <div className={`${bar} h-4 w-40`} />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`${bar} h-3`} style={{ width: `${92 - i * 9}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
