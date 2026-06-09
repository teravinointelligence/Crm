// Cliente Base44 para la app "Teravino Flota" (parque vehicular / flotilla).
// SERVER-ONLY: usa la API key directa, nunca debe llegar al browser.
//
// Mismo patrón que lib/base44-docs.ts: pega al subdominio publicado del app
// (teravino-flota.base44.app/api) y es lazy — importar este módulo no falla si
// faltan env vars; solo al hacer la primera llamada se valida y se lanza un
// error claro, para que una pantalla /flota/* no tire la app completa si todavía
// no se configuraron los secretos en Vercel.

import "server-only";

// Tipos, enums y helpers puros viven en un módulo aparte (sin server-only) para
// que los componentes cliente los importen sin arrastrar la API key. Los
// re-exportamos aquí para que el código server siga importándolos desde un
// único lugar.
export {
  FLOTA_REQUIRED_FIELDS,
  POLICY_COVERAGES,
  SERVICE_TYPES,
  missingFields,
  daysUntil,
  type FlotaVehicle,
  type FlotaInsurancePolicy,
  type FlotaMechanicalService,
  type PolicyCoverage,
  type ServiceType,
} from "./flota-types";

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
      remove: (id: string) =>
        request<unknown>(`/entities/${name}/${id}`, { method: "DELETE" }),
    };
  },
};
