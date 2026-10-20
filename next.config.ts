import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content Security Policy: só scripts, estilos e imagens da própria aplicação (o QR Code do Pix é data: URI)
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Uploads de documentos e arquivos bancários de até 10 MB.
  // ATENÇÃO (Vercel): o corpo máximo de uma função é ~4,5 MB; acima disso a plataforma recusa (413) antes do Next.
  // Limite de negócio mantido; ver docs/DEPLOY.md (pendência de decisão).
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  // O /tour lê public/demo/ com fs em tempo de execução: inclui os arquivos no bundle da função na Vercel
  outputFileTracingIncludes: { "/tour": ["./public/demo/**"] },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Esconde o botão "N" do Next.js que aparece no canto durante o desenvolvimento
  devIndicators: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Páginas com dados pessoais não ficam em cache de proxies ou do navegador
      { source: "/acordo/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
