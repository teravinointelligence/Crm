import "server-only";

import { headers } from "next/headers";
import { LOS_CABOS_DRIVER_EMAILS, normalizeDriverEmail } from "@/lib/reparto/autoservicio-los-cabos";

const RH_URL = (process.env.TERAVINO_RH_URL ?? "https://teravinorh.vercel.app").replace(/\/$/, "");

export type RhAvailability =
  | { ok: true; availableEmails: string[]; unavailableEmails: string[] }
  | { ok: false; availableEmails: []; unavailableEmails: string[] };

export async function getRhDriverAvailability(date: string): Promise<RhAvailability> {
  const oidcToken = headers().get("x-vercel-oidc-token");
  if (!oidcToken) {
    console.error("Vercel no proporcionó un token OIDC para consultar TERAVINO RH");
    return { ok: false, availableEmails: [], unavailableEmails: [...LOS_CABOS_DRIVER_EMAILS] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      `${RH_URL}/api/integrations/reparto/disponibilidad?date=${encodeURIComponent(date)}`,
      {
        headers: { Authorization: `Bearer ${oidcToken}` },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`RH respondió ${response.status}`);
    const body = (await response.json()) as {
      date?: unknown;
      availableEmails?: unknown;
      unavailableEmails?: unknown;
    };
    if (body.date !== date || !Array.isArray(body.availableEmails) || !Array.isArray(body.unavailableEmails)) {
      throw new Error("Respuesta inválida de RH");
    }

    const allowed = new Set<string>(LOS_CABOS_DRIVER_EMAILS);
    const availableEmails = body.availableEmails
      .filter((email): email is string => typeof email === "string")
      .map(normalizeDriverEmail)
      .filter((email) => allowed.has(email));
    const available = new Set(availableEmails);
    return {
      ok: true,
      availableEmails,
      unavailableEmails: LOS_CABOS_DRIVER_EMAILS.filter((email) => !available.has(email)),
    };
  } catch (error) {
    console.error("No se pudo confirmar disponibilidad con TERAVINO RH", error);
    return { ok: false, availableEmails: [], unavailableEmails: [...LOS_CABOS_DRIVER_EMAILS] };
  } finally {
    clearTimeout(timer);
  }
}
