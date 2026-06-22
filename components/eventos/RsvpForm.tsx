"use client";

import { useState } from "react";

const VINO = "#7a1220";

export function RsvpForm({
  token,
  initial,
}: {
  token: string;
  initial: string;
}) {
  const [status, setStatus] = useState(initial);
  const [pending, setPending] = useState<null | "accepted" | "declined">(null);
  const [error, setError] = useState("");

  const respond = async (response: "accepted" | "declined") => {
    setPending(response);
    setError("");
    try {
      const res = await fetch(`/api/invitacion/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo registrar tu respuesta.");
      } else {
        setStatus(response);
      }
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setPending(null);
    }
  };

  if (status === "accepted") {
    return (
      <p style={{ fontSize: 16, fontWeight: 600, color: "#166534" }}>
        ¡Gracias! Tu asistencia quedó confirmada. 🍷
      </p>
    );
  }
  if (status === "declined") {
    return (
      <div>
        <p style={{ fontSize: 16, fontWeight: 600, color: "#9a3412" }}>
          Registramos que no podrás acompañarnos. ¡Será en otra ocasión!
        </p>
        <button
          onClick={() => setStatus("pending")}
          style={{ marginTop: 8, background: "none", border: "none", color: VINO, cursor: "pointer", textDecoration: "underline" }}
        >
          Cambiar mi respuesta
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => respond("accepted")}
          disabled={pending !== null}
          style={{
            background: VINO,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "12px 24px",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {pending === "accepted" ? "Confirmando…" : "Sí, asistiré"}
        </button>
        <button
          onClick={() => respond("declined")}
          disabled={pending !== null}
          style={{
            background: "#fff",
            color: VINO,
            border: `1px solid ${VINO}`,
            borderRadius: 8,
            padding: "12px 24px",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {pending === "declined" ? "Registrando…" : "No podré asistir"}
        </button>
      </div>
      {error && <p style={{ color: "#b91c1c", marginTop: 12 }}>{error}</p>}
    </div>
  );
}
