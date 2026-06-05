"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Marca la "última conexión" del usuario actual mientras tiene la app abierta:
 * al montar, cada 60s, y cuando la pestaña vuelve a estar visible. Alimenta la
 * pantalla de Equipo ("quién está en línea"). No renderiza nada.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    const supabase = createClient();
    let alive = true;

    const ping = async () => {
      if (!alive || document.visibilityState === "hidden") return;
      const { error } = await supabase.rpc("touch_presence");
      if (error) console.warn("[presence] touch_presence falló:", error.message);
    };

    ping();
    const interval = setInterval(ping, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
