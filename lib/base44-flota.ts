// Cliente Base44 para la app "Teravino Flota" (parque vehicular / flotilla).
// SERVER-ONLY: usa la API key directa, nunca debe llegar al browser.
//
// Mismo patrón que lib/base44-docs.ts: pega al subdominio publicado del app
// (teravino-flota.base44.app/api) y es lazy — importar este módulo no falla si
// faltan env vars; solo al hacer la primera llamada se valida y se lanza un
// error claro, para que una pantalla /flota/* no tire la app completa si todavía
// no se configuraron los secretos en Vercel.

import "server-only";

// Base de la REST API del app de Flota. Acepta el dominio publicado con o sin
// sufijo /api (lo normalizamos). Default al subdominio publicado conocido.
function baseUrl(): string {
  const raw = (process.env.BASE44_FLOTA_URL || "https://teravino-flota.base44.app").trim();
  const noSlash = raw.replace(/\/+$/, "");
  return noSlash.endsWith("/api") ? noSlash : `${noSlash}/api`;
}

function authHeaders() {
  // Cae a BASE44_API_KEY por si la key es de cuenta (compartida entre apps).
  const key = process.env.BASE44_FLOTA_API_KEY || process.env.BASE44_API_KEY;
  if (!key) {
    throw new Error(
      "Falta BASE44_FLOTA_API_KEY en el entorno (API key del app Teravino Flota en Base44; puede caer a BASE44_API_KEY si la key es de cuenta).",
    );
  }
  return {
    api_key: key,
    "Content-Type": "application/json",
  };
}

type ListParams = {
  q?: Record<string, unknown>;
  limit?: number;
  skip?: number;
  sort_by?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Base44 Flota ${res.status} ${res.statusText} en ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

function buildListQuery(params: ListParams = {}): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", JSON.stringify(params.q));
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.skip != null) search.set("skip", String(params.skip));
  if (params.sort_by) search.set("sort_by", params.sort_by);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const base44Flota = {
  entity<T extends Record<string, unknown>>(name: string) {
    return {
      list: (params?: ListParams) => request<T[]>(`/entities/${name}${buildListQuery(params)}`),
      get: (id: string) => request<T>(`/entities/${name}/${id}`),
      create: (data: Partial<T>) =>
        request<T>(`/entities/${name}`, { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, data: Partial<T>) =>
        request<T>(`/entities/${name}/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    };
  },
};

// ----- Tipos compartidos (seguros para el browser) -----

export type FlotaVehicle = {
  id: string;
  brand: string;
  model: string;
  year: number;
  version?: string | null;
  plates?: string | null;
  vin?: string | null;
  holder?: string | null;
  location?: string | null;
  assigned_driver?: string | null;
  current_km?: number | null;
  estimated_value?: number | null;
  notes?: string | null;
  created_date?: string;
  updated_date?: string;
};

// Campos que un vehículo "debería" tener llenos para considerarse completo.
// El módulo Flota existe para que Logística complete justamente estos.
export const FLOTA_REQUIRED_FIELDS = [
  { key: "plates", label: "Placas" },
  { key: "vin", label: "No. de serie (VIN)" },
  { key: "holder", label: "Titular" },
  { key: "assigned_driver", label: "Conductor asignado" },
  { key: "location", label: "Plaza" },
  { key: "current_km", label: "Kilometraje" },
] as const satisfies ReadonlyArray<{ key: keyof FlotaVehicle; label: string }>;

function isBlank(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/** Devuelve las etiquetas de los campos importantes que están vacíos. */
export function missingFields(v: FlotaVehicle): string[] {
  return FLOTA_REQUIRED_FIELDS.filter((f) => isBlank(v[f.key])).map((f) => f.label);
}
