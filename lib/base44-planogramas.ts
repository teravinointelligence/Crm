// Cliente Base44 para la app "Teravino Map" (planogramas de bodega), publicada
// en teravino-planogramas.base44.app.
// SERVER-ONLY: usa la API key directa, nunca debe llegar al browser.
//
// Mismo patrón que lib/base44-flota.ts: pega al subdominio publicado del app
// (.../api) y es lazy — importar este módulo no falla si faltan env vars; solo
// al hacer la primera llamada se valida y se lanza un error claro, para que una
// pantalla /planogramas/* no tire la app completa si todavía no se configuraron
// los secretos en Vercel.
//
// El módulo del CRM es de SOLO CONSULTA: la captura y el acomodo siguen
// haciéndose en la app de Base44 (por eso aquí no hay create/update/delete).

import "server-only";

// Tipos y helpers puros viven en un módulo aparte (sin server-only) para que los
// componentes cliente los importen sin arrastrar la API key. Los re-exportamos
// aquí para que el código server siga importándolos desde un único lugar.
export {
  ACCENT,
  PRESENTACIONES,
  accentHex,
  botellasDeCaja,
  buscar,
  construirIndice,
  norm,
  porCelda,
  porTarima,
  rackOf,
  totalBotellas,
  ubicacionCaja,
  ubicacionPosicion,
  type AccentColor,
  type Hallazgo,
  type PlanoBodega,
  type PlanoCaja,
  type PlanoPosicion,
  type Presentacion,
} from "./planogramas-types";

import type { PlanoBodega, PlanoCaja, PlanoPosicion } from "./planogramas-types";

/** URL pública del app en Base44, para el botón "Editar en Teravino Map". */
export const PLANOGRAMAS_APP_URL = (
  process.env.BASE44_PLANOGRAMAS_URL || "https://teravino-planogramas.base44.app"
)
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");

// Base de la REST API del app. Acepta el dominio publicado con o sin sufijo
// /api (lo normalizamos). Default al subdominio publicado conocido.
function baseUrl(): string {
  return `${PLANOGRAMAS_APP_URL}/api`;
}

// A diferencia de Flota/Docs/Consignaciones, la API de LECTURA de este app
// responde sin credenciales (verificado 2026-08-12), así que la key es
// OPCIONAL: si está la mandamos, y si no, igual leemos. Así el módulo funciona
// sin agregar env vars nuevas. Si algún día Base44 cierra la lectura, el 401 se
// traduce abajo en un mensaje que pide configurar la key.
function authHeaders() {
  // Cae a BASE44_API_KEY por si la key es de cuenta (compartida entre apps).
  const key = process.env.BASE44_PLANOGRAMAS_API_KEY || process.env.BASE44_API_KEY;
  return {
    ...(key ? { api_key: key } : {}),
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
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Teravino Map ya no deja leer sin credenciales: configura BASE44_PLANOGRAMAS_API_KEY (o BASE44_API_KEY) en Vercel → Settings → Environment Variables.",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Base44 Planogramas ${res.status} ${res.statusText} en ${path}: ${body.slice(0, 300)}`,
    );
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

export const base44Planogramas = {
  entity<T extends Record<string, unknown>>(name: string) {
    return {
      list: (params?: ListParams) => request<T[]>(`/entities/${name}${buildListQuery(params)}`),
      get: (id: string) => request<T>(`/entities/${name}/${id}`),
    };
  },
};

// Topes de lectura. Hoy la operación va en cientos de registros; el tope evita
// que una bodega mal capturada traiga miles de filas a una página server.
const LIMITE_BODEGAS = 100;
const LIMITE_UBICACIONES = 2000;

export function listarBodegas(): Promise<PlanoBodega[]> {
  return base44Planogramas
    .entity<PlanoBodega>("Bodega")
    .list({ sort_by: "nombre", limit: LIMITE_BODEGAS });
}

export function obtenerBodega(id: string): Promise<PlanoBodega> {
  return base44Planogramas.entity<PlanoBodega>("Bodega").get(id);
}

/** Posiciones (botellas en rack). Sin `bodegaId` trae las de todas las bodegas. */
export function listarPosiciones(bodegaId?: string): Promise<PlanoPosicion[]> {
  return base44Planogramas.entity<PlanoPosicion>("Posicion").list({
    ...(bodegaId ? { q: { bodega_id: bodegaId } } : {}),
    limit: LIMITE_UBICACIONES,
  });
}

/** Cajas (tarimas). Sin `bodegaId` trae las de todas las bodegas. */
export function listarCajas(bodegaId?: string): Promise<PlanoCaja[]> {
  return base44Planogramas.entity<PlanoCaja>("Caja").list({
    ...(bodegaId ? { q: { bodega_id: bodegaId } } : {}),
    limit: LIMITE_UBICACIONES,
  });
}
