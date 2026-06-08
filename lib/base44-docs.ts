// Cliente Base44 para la app "Teravino Docs" (formatos / acuerdos con clientes).
// SERVER-ONLY: usa la API key directa, nunca debe llegar al browser.
//
// Es un app de Base44 distinto al de Consignaciones (TERAVINO Flow), por eso
// tiene su propia URL y key. Mismo patrón lazy que lib/base44.ts: importar este
// módulo no falla si faltan env vars; solo al hacer la primera llamada se valida
// y se lanza un error claro, para que una pantalla /documentos/* no tire la app
// completa si todavía no se configuraron los secretos en Vercel.

import "server-only";

// Tipos y etiquetas puras viven en un módulo aparte (sin server-only) para que
// los componentes cliente puedan importarlos sin arrastrar la API key.
export {
  DOC_CATEGORY_LABEL,
  DOC_STATUS_LABEL,
  type DocCategory,
  type DocStatus,
  type Base44DocTemplate,
  type Base44GeneratedDoc,
} from "./documentos-types";

// Base de la REST API del app de Docs. Acepta el dominio publicado del app en
// Base44 con o sin sufijo /api (lo normalizamos). Ej:
//   BASE44_DOCS_URL=https://teravino-docs.base44.app
function baseUrl(): string {
  const raw = process.env.BASE44_DOCS_URL?.trim();
  if (!raw) {
    throw new Error(
      "Falta BASE44_DOCS_URL en el entorno (la URL publicada del app Teravino Docs en Base44, ej. https://teravino-docs.base44.app).",
    );
  }
  const noSlash = raw.replace(/\/+$/, "");
  return noSlash.endsWith("/api") ? noSlash : `${noSlash}/api`;
}

function authHeaders() {
  // Cae a BASE44_API_KEY por si la key es de cuenta (compartida entre apps).
  const key = process.env.BASE44_DOCS_API_KEY || process.env.BASE44_API_KEY;
  if (!key) {
    throw new Error(
      "Falta BASE44_DOCS_API_KEY en el entorno (API key del app Teravino Docs en Base44).",
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
    throw new Error(`Base44 Docs ${res.status} ${res.statusText} en ${path}: ${body.slice(0, 300)}`);
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

export const base44Docs = {
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
