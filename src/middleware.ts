import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isPublic } from "@/lib/public-routes";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (isPublic(path)) return NextResponse.next();

  const token = req.cookies.get("finops_session")?.value;
  const secret = process.env.AUTH_SECRET;
  let ok = false;
  // Sem segredo configurado (ou curto), ninguém entra: falha fechada
  if (token && secret && secret.length >= 32) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      ok = true;
    } catch {}
  }
  const isLogin = path.startsWith("/login");
  // A landing page ("/") é pública para quem não está logado; logado, "/" leva ao painel (abaixo)
  if (!ok && !isLogin && path !== "/") {
    if (path.startsWith("/api/")) return new NextResponse("Não autorizado", { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (ok && (isLogin || path === "/")) return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon.ico|demo|video/).*)"] };
