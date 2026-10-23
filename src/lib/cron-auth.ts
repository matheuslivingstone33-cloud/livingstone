// Autorização dos crons da Vercel: Authorization: Bearer {CRON_SECRET}. Sem CRON_SECRET, tudo é recusado.
import { timingSafeEqual } from "node:crypto";

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function cronAutorizado(headers: Headers, env: Record<string, string | undefined> = process.env): boolean {
  const secret = env.CRON_SECRET ?? "";
  return !!secret && safeEqual(headers.get("authorization") ?? "", `Bearer ${secret}`);
}
