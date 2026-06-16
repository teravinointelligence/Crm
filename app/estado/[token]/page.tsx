// /estado/[token] — Página PÚBLICA del estado de cuenta (sin login).
// Valida el token, muestra un resumen amable y un botón para descargar el PDF
// completo. Ruta exenta del auth de Supabase en el middleware. Todo con
// service-role tras validar el token.
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildStatementData } from "@/lib/statement";
import { resolveStatementToken } from "@/lib/statement-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VINO = "#7a1220";
const CREMA = "#FAF7F2";

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: CREMA,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#222",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          padding: 32,
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: 4,
            color: VINO,
            fontWeight: 700,
            marginBottom: 20,
          }}
        >
          TERAVINO
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function EstadoCuentaPublico({
  params,
}: {
  params: { token: string };
}) {
  const admin = supabaseAdmin();
  const resolved = await resolveStatementToken(admin, params.token);

  if (!resolved) {
    return (
      <Shell>
        <h1 style={{ fontSize: 20, color: VINO, marginTop: 0 }}>Link no disponible</h1>
        <p style={{ lineHeight: 1.6 }}>
          Este enlace ya no es válido o expiró. Por seguridad, los enlaces al estado de
          cuenta tienen una vigencia limitada. Solicítanos uno nuevo respondiendo a tu
          último correo o escribiendo a{" "}
          <a href="mailto:cobranza@teravino.com" style={{ color: VINO }}>
            cobranza@teravino.com
          </a>
          .
        </p>
      </Shell>
    );
  }

  const data = await buildStatementData(admin, resolved.accountId);
  if (!data) {
    return (
      <Shell>
        <h1 style={{ fontSize: 20, color: VINO, marginTop: 0 }}>Cuenta no encontrada</h1>
        <p style={{ lineHeight: 1.6 }}>
          No pudimos cargar el estado de cuenta. Escríbenos a{" "}
          <a href="mailto:cobranza@teravino.com" style={{ color: VINO }}>
            cobranza@teravino.com
          </a>
          .
        </p>
      </Shell>
    );
  }

  const t = data.totals;
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: "Total facturado", value: mxn(t.facturado) },
    { label: "Total pagado", value: mxn(t.pagado) },
    { label: "Saldo pendiente", value: mxn(t.pendiente), strong: true },
    { label: "Saldo vencido", value: mxn(t.vencido), strong: true },
  ];

  return (
    <Shell>
      <h1 style={{ fontSize: 20, color: VINO, marginTop: 0, marginBottom: 4 }}>
        Estado de cuenta
      </h1>
      <p style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 600 }}>
        {data.account.business_name}
      </p>

      <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "12px 16px",
              background: i % 2 ? "#faf7f2" : "#fff",
              fontWeight: r.strong ? 700 : 400,
              color: r.strong ? VINO : "#222",
            }}
          >
            <span>{r.label}</span>
            <span>{r.value}</span>
          </div>
        ))}
      </div>

      <a
        href={`/api/estado/${params.token}/pdf`}
        style={{
          display: "block",
          textAlign: "center",
          marginTop: 24,
          background: VINO,
          color: "#fff",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 15,
          padding: "14px 20px",
          borderRadius: 8,
        }}
      >
        Descargar estado de cuenta (PDF)
      </a>

      <p style={{ color: "#888", fontSize: 12, marginTop: 20, lineHeight: 1.5 }}>
        Información confidencial de tu cuenta con TERAVINO. Si no reconoces este enlace,
        ignóralo. ¿Dudas sobre tu saldo? Escríbenos a{" "}
        <a href="mailto:cobranza@teravino.com" style={{ color: VINO }}>
          cobranza@teravino.com
        </a>
        .
      </p>
    </Shell>
  );
}
