import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessAcademy, canAccessFacturacion, canAccessFlota, canViewCuentas, isRepartoOnlyRole } from "@/lib/modules";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet: CookieToSet[]) {
          toSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login");
  // Los crons de Vercel llegan SIN sesión (sin cookie): no deben redirigirse a
  // /login. Se auto-protegen con CRON_SECRET en su propio handler.
  const isCron = path.startsWith("/api/cron");
  const isPublic = isAuthRoute || isCron || path.startsWith("/_next") || path === "/favicon.ico";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  // Usuario autenticado: necesitamos su rol para (a) romper el loop de quien no
  // es usuario del CRM y (b) confinar a los roles "solo-reparto" a /reparto/*.
  if (user) {
    const { data: rep } = await supabase
      .from("sales_reps")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    // Autenticado pero sin perfil en el CRM: no tiene acceso. Lo dejamos en
    // /login (que SÍ se renderiza para él), evitando el loop /login ⇄ /.
    if (!rep) {
      if (isAuthRoute) return response;
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("error", "sin_acceso");
      return NextResponse.redirect(url);
    }

    const repartoOnly = isRepartoOnlyRole(rep.role);

    // Ya logueado y entrando a /login → mándalo a su home.
    if (isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = repartoOnly ? "/reparto/dashboard" : "/";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Confinamiento: un rol solo-reparto únicamente puede tocar /reparto/* y su
    // API, los Manuales (SOPs, de consulta para todo el equipo), más /flota/*
    // y Academy si su rol tiene acceso (jefe de logística).
    if (repartoOnly) {
      const flotaOk =
        canAccessFlota(rep.role) &&
        (path.startsWith("/flota") || path.startsWith("/api/flota"));
      // El facturista (jefe de logística) además opera Consignaciones y Documentos.
      const facturaOk =
        canAccessFacturacion(rep.role) &&
        (path.startsWith("/consignaciones") ||
          path.startsWith("/api/consignaciones") ||
          path.startsWith("/documentos") ||
          path.startsWith("/api/documentos"));
      const academyOk = canAccessAcademy(rep.role) && path.startsWith("/academy");
      // El jefe de logística también consulta las fichas de clientes (lectura).
      const cuentasOk =
        canViewCuentas(rep.role) &&
        (path.startsWith("/cuentas") || path.startsWith("/api/cuentas"));
      const allowed =
        path.startsWith("/reparto") ||
        path.startsWith("/api/reparto") ||
        path.startsWith("/manuales") ||
        flotaOk ||
        facturaOk ||
        academyOk ||
        cuentasOk;
      if (!allowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/reparto/dashboard";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
