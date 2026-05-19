// Cliente Base44 para la app TERAVINO Flow (consignaciones / tomas de inventario).
// SERVER-ONLY: usa la API key directa, nunca debe llegar al browser.
//
// Inicialización lazy: importar este módulo no falla si faltan env vars; solo al
// hacer la primera llamada se valida y se lanza un error claro. Mismo patrón
// que lib/supabase-reparto.ts — evita que un /consignaciones/* tire la app
// completa durante el primer deploy.

import "server-only";

const BASE_URL = "https://teravino-consignment-flow.base44.app/api";

function authHeaders() {
  const key = process.env.BASE44_API_KEY;
  if (!key) {
    throw new Error(
      "Falta BASE44_API_KEY en el entorno (Vercel → Settings → Environment Variables).",
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
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
    // Las rutas /api del CRM corren en server actions / route handlers, no las cacheamos.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Base44 ${res.status} ${res.statusText} en ${path}: ${body.slice(0, 300)}`);
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

/**
 * Cliente tipado mínimo. Para cada entidad expone list/get/create/update.
 * Si necesitas otras operaciones (delete, bulk, restore), agrégalas aquí —
 * mantenemos un solo punto que conoce la auth y los errores.
 */
export const base44 = {
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
  function<TIn, TOut>(name: string) {
    return (payload: TIn) =>
      request<TOut>(`/functions/${name}`, { method: "POST", body: JSON.stringify(payload) });
  },
};

// Tipos compartidos por las rutas /api/consignaciones y las pantallas.
export type Base44Vendedor = {
  id: string;
  nombre: string;
  email?: string;
  telefono?: string;
  zona?: string;
  activo?: boolean;
};

export type Base44Cliente = {
  id: string;
  nombre: string;
  numero_cliente?: string;
  razon_social?: string;
  locacion?: string;
  contacto?: string;
  telefono?: string;
  direccion?: string;
  vendedor_id?: string;
  vendedor_nombre?: string;
  tiene_consignacion?: boolean;
  notas?: string;
};

export type Base44Producto = {
  id: string;
  codigo?: string;
  nombre: string;
  bodega?: string;
  tipo?: "Tinto" | "Blanco" | "Rosado" | "Espumante" | "Otro";
  precio_unitario?: number;
  stock?: number;
  descontinuado?: boolean;
};

export type Base44ConsignacionItem = {
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
};

export type Base44Consignacion = {
  id: string;
  cliente_id: string;
  cliente_nombre?: string;
  vendedor_id: string;
  vendedor_nombre?: string;
  chofer_id?: string;
  chofer_nombre?: string;
  fecha: string;
  items?: Base44ConsignacionItem[];
  total?: number;
  estado: "pendiente" | "parcial" | "liquidada" | "devuelta";
  cantidad_vendida?: number;
  cantidad_devuelta?: number;
  monto_cobrado?: number;
  notas?: string;
  created_date?: string;
  updated_date?: string;
};

export type Base44TomaInventario = {
  id: string;
  numero_toma?: string;
  cliente_id: string;
  cliente_nombre?: string;
  vendedor_id: string;
  vendedor_nombre?: string;
  fecha_toma: string;
  total_botellas?: number;
  total_etiquetas?: number;
  estado: "borrador" | "firmado" | "sincronizado_drive" | "anulado";
  pdf_url?: string;
  auditoria_resultado?: "no_evaluada" | "aprobada" | "sospechosa" | "no_auditada" | "requiere_validacion";
  auditoria_score?: number;
};

/**
 * Resuelve el `Vendedor` de Base44 que corresponde al usuario del CRM por email.
 * Devuelve null si no hay match (usuario admin sin vendedor, o emails desincronizados).
 */
export async function resolveBase44Vendedor(email: string): Promise<Base44Vendedor | null> {
  const matches = await base44
    .entity<Base44Vendedor>("Vendedor")
    .list({ q: { email }, limit: 1 });
  return matches[0] ?? null;
}
