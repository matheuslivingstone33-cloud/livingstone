// Ícones de traço (24x24), desenhados para a mesma espessura e cantos arredondados.
export const ICONS: Record<string, string> = {
  // Módulos
  painel: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  conciliacao: "M7 7h13M7 7l3-3M7 7l3 3M17 17H4m13 0-3-3m3 3-3 3",
  credito: "M3 7h18v10H3V7Zm0 4h18M7 15h3",
  cobranca: "M12 3v18M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5S9.8 10 12 10s4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5",
  pld: "M12 3 4 6v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-3Zm-3 9 2 2 4-4",
  legado: "m8 8-4 4 4 4m8-8 4 4-4 4m-3-10-2 12",
  auditoria: "M9 4h6l1 2h3v14H5V6h3l1-2Zm-1 9h8m-8 4h5",
  usuarios: "M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 8v-1a4 4 0 0 0-3-3.9M16 4.2a3.5 3.5 0 0 1 0 6.6",
  configuracoes: "M4 7h10m4 0h2M4 17h2m4 0h10M14 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM6 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z",
  // Utilitários
  upload: "M12 15V4m0 0-4 4m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  download: "M12 4v11m0 0-4-4m4 4 4-4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  check: "m5 12 5 5 9-10",
  alert: "M12 9v4m0 3.5v.01M10.3 4.2 2.8 17.4A2 2 0 0 0 4.5 20.4h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z",
  info: "M12 11v5m0-8.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  back: "M19 12H5m5-5-5 5 5 5",
  close: "m6 6 12 12M18 6 6 18",
  copy: "M8 8h11v12H8V8Zm-3 8V4h11",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4m-4 4h11",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  lock: "M6 11h12v9H6v-9Zm2 0V8a4 4 0 1 1 8 0v3",
  chain: "M9 7H7a5 5 0 0 0 0 10h2m6-10h2a5 5 0 0 1 0 10h-2m-7-5h8",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5",
  sparkle: "M12 4v4m0 8v4M4 12h4m8 0h4M7 7l2 2m6 6 2 2M7 17l2-2m6-6 2-2",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  whatsapp: "M4 20l1.3-4A8 8 0 1 1 8 18.7L4 20Zm5-11c0 3 3 6 6 6l1.2-1.4-2-1-1 .8a4 4 0 0 1-2.6-2.6l.8-1-1-2L9 9Z",
  external: "M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
};

export function Icon({ name, size = 18, className, strokeWidth = 1.7 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
