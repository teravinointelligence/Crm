import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // FacturaFoto se publica únicamente en una rama de preview protegida por
  // Vercel Authentication; evita pedir además un segundo inicio de sesión del CRM.
  if (request.nextUrl.pathname.startsWith("/facturafoto-preview")) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
