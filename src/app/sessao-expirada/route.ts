import { NextResponse, type NextRequest } from "next/server";

// Sessão revogada: apaga o cookie aqui (route handler pode alterar cookies) e manda ao login
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete("finops_session");
  return res;
}
