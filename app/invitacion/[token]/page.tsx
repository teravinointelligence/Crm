// /invitacion/[token] — Página PÚBLICA de confirmación de asistencia (RSVP) a un
// evento, sin login. Valida el rsvp_token y muestra los datos del evento + los
// botones de respuesta. Ruta exenta del auth en el middleware. Todo con
// service-role tras validar el token.
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";
import { RsvpForm } from "@/components/eventos/RsvpForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VINO = "#7a1220";
const CREMA = "#FAF7F2";

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
          maxWidth: 540,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          padding: 32,
        }}
      >
        <div
          style={{ fontSize: 22, letterSpacing: 4, color: VINO, fontWeight: 700, marginBottom: 20 }}
        >
          TERAVINO
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function InvitacionPublica({ params }: { params: { token: string } }) {
  const admin = supabaseAdmin();
  const { data: guest } = await admin
    .from("event_guests")
    .select(
      "id, confirmation_status, guest_name, contact:contact_id(full_name), event:event_id(name, start_date, venue_name, venue_address, city, description)",
    )
    .eq("rsvp_token", params.token)
    .maybeSingle();

  if (!guest || !guest.event) {
    return (
      <Shell>
        <h1 style={{ fontSize: 20, color: VINO, marginTop: 0 }}>Invitación no disponible</h1>
        <p style={{ lineHeight: 1.6 }}>
          Este enlace no es válido. Si crees que es un error, responde al correo de tu invitación.
        </p>
      </Shell>
    );
  }

  const ev = guest.event as unknown as {
    name: string;
    start_date: string;
    venue_name: string | null;
    venue_address: string | null;
    city: string;
    description: string | null;
  };
  const contact = guest.contact as unknown as { full_name: string | null } | null;
  const guestName = guest.guest_name || contact?.full_name || "";

  return (
    <Shell>
      <p style={{ marginTop: 0 }}>Hola {guestName},</p>
      <p>Estás invitado(a) a:</p>
      <h1 style={{ fontSize: 24, color: VINO, margin: "8px 0" }}>{ev.name}</h1>
      <p style={{ margin: "4px 0" }}>
        <strong>Cuándo:</strong> {formatDateTime(ev.start_date)}
      </p>
      {ev.venue_name && (
        <p style={{ margin: "4px 0" }}>
          <strong>Dónde:</strong> {ev.venue_name}
          {ev.venue_address ? ` — ${ev.venue_address}` : ""}
        </p>
      )}
      <p style={{ margin: "4px 0" }}>
        <strong>Ciudad:</strong> {ev.city}
      </p>
      {ev.description && <p style={{ lineHeight: 1.6, marginTop: 12 }}>{ev.description}</p>}
      <div style={{ marginTop: 24 }}>
        <RsvpForm token={params.token} initial={guest.confirmation_status as string} />
      </div>
    </Shell>
  );
}
