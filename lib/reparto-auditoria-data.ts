// Carga de la auditoría de entregas de Reparto. SERVER-ONLY (usa el cliente
// service_role del esquema `reparto`). La lógica de clasificación vive en
// lib/reparto-auditoria.ts (pura y probada); aquí solo se consulta y se arma.

import "server-only";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { dateKeyTz } from "@/lib/utils";
import {
  ESTATUS_EN_CAMINO,
  agruparPorChofer,
  auditarPendientes,
  esEntregadoSinEvidencia,
  resumenAuditoria,
  type Auditado,
  type ChoferAuditoria,
  type ResumenAuditoria,
} from "@/lib/reparto-auditoria";
import type { PedidoEstatus, PedidoTipo } from "@/types/reparto";

/** Fila cruda del pedido tal como la devuelve Supabase (entregas embebidas). */
type PedidoRow = {
  id: string;
  numero_factura: string;
  tipo: PedidoTipo | null;
  fecha: string;
  estatus: PedidoEstatus;
  prioridad: string | null;
  total: number | null;
  clientes: { id: string; nombre: string; ciudad: string | null } | null;
  chofer: { id: string; nombre: string; telefono: string | null } | null;
  // reparto.entregas.pedido_id es UNIQUE: PostgREST puede devolver objeto o arreglo.
  entregas: EntregaLite | EntregaLite[] | null;
};

type EntregaLite = { id: string; foto_url: string | null; timestamp_entrega: string | null };

export type PedidoAuditoriaRow = {
  id: string;
  numero_factura: string;
  tipo: PedidoTipo | null;
  fecha: string;
  estatus: PedidoEstatus;
  prioridad: string | null;
  total: number | null;
  cliente: { id: string; nombre: string; ciudad: string | null } | null;
  chofer: { id: string; nombre: string; telefono: string | null } | null;
  tieneFoto: boolean;
};

export type AuditoriaEntregas = {
  /** Hoy en hora de Los Cabos (AAAA-MM-DD): la referencia de todos los cálculos. */
  hoy: string;
  /** Pendientes de subir evidencia, del más atrasado al menos. */
  pendientes: Auditado<PedidoAuditoriaRow>[];
  /** Cerrados como entregados pero sin foto en la bitácora. */
  entregadosSinFoto: PedidoAuditoriaRow[];
  resumen: ResumenAuditoria;
  porChofer: ChoferAuditoria[];
};

const SELECT_PEDIDO =
  "id, numero_factura, tipo, fecha, estatus, prioridad, total, " +
  "clientes:cliente_id(id, nombre, ciudad), chofer:chofer_id(id, nombre, telefono), " +
  "entregas(id, foto_url, timestamp_entrega)";

function normalizar(row: PedidoRow): PedidoAuditoriaRow {
  const entregas: EntregaLite[] = Array.isArray(row.entregas)
    ? row.entregas
    : row.entregas
      ? [row.entregas]
      : [];
  return {
    id: row.id,
    numero_factura: row.numero_factura,
    tipo: row.tipo,
    fecha: row.fecha,
    estatus: row.estatus,
    prioridad: row.prioridad,
    total: row.total,
    cliente: row.clientes,
    chofer: row.chofer,
    tieneFoto: entregas.some((e) => Boolean(e.foto_url)),
  };
}

/**
 * Auditoría completa. `dias` acota qué tan atrás se mira (por defecto 90 días):
 * lo anterior es historia migrada que ya no se va a cerrar con evidencia.
 */
export async function loadAuditoriaEntregas({
  dias = 90,
  limit = 200,
}: { dias?: number; limit?: number } = {}): Promise<AuditoriaEntregas> {
  const hoy = dateKeyTz(new Date());
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const desdeISO = dateKeyTz(desde);

  const [enCaminoRes, entregadosRes] = await Promise.all([
    repartoAdmin
      .from("pedidos")
      .select(SELECT_PEDIDO)
      .in("estatus", [...ESTATUS_EN_CAMINO])
      .gte("fecha", desdeISO)
      .lt("fecha", hoy)
      .order("fecha", { ascending: true })
      .limit(limit),
    // Entregados recientes: se revisa que la evidencia exista (cierre a mano).
    repartoAdmin
      .from("pedidos")
      .select(SELECT_PEDIDO)
      .eq("estatus", "entregado")
      .gte("fecha", desdeISO)
      .order("fecha", { ascending: false })
      .limit(limit),
  ]);

  const enCamino = (((enCaminoRes.data ?? []) as unknown) as PedidoRow[]).map(normalizar);
  const entregados = (((entregadosRes.data ?? []) as unknown) as PedidoRow[]).map(normalizar);

  const pendientes = auditarPendientes(enCamino, hoy);

  return {
    hoy,
    pendientes,
    entregadosSinFoto: entregados.filter(esEntregadoSinEvidencia),
    resumen: resumenAuditoria(pendientes),
    porChofer: agruparPorChofer(pendientes),
  };
}

/**
 * Conteo ligero para la barra del dashboard de inicio del CRM. No revienta la
 * página si Reparto no está configurado en el entorno: devuelve ceros.
 */
export async function contarPendientesEvidencia(): Promise<{ total: number; criticos: number; diasMax: number }> {
  try {
    const hoy = dateKeyTz(new Date());
    const desde = new Date();
    desde.setDate(desde.getDate() - 90);
    const { data } = await repartoAdmin
      .from("pedidos")
      .select("id, estatus, fecha, entregas(foto_url)")
      .in("estatus", [...ESTATUS_EN_CAMINO])
      .gte("fecha", dateKeyTz(desde))
      .lt("fecha", hoy)
      .limit(500);

    type Lite = { id: string; estatus: string; fecha: string; entregas: { foto_url: string | null } | { foto_url: string | null }[] | null };
    const rows = ((data ?? []) as unknown as Lite[]).map((r) => {
      const e = Array.isArray(r.entregas) ? r.entregas : r.entregas ? [r.entregas] : [];
      return { id: r.id, estatus: r.estatus, fecha: r.fecha, tieneFoto: e.some((x) => Boolean(x.foto_url)) };
    });
    const { total, criticos, diasMax } = resumenAuditoria(auditarPendientes(rows, hoy));
    return { total, criticos, diasMax };
  } catch {
    return { total: 0, criticos: 0, diasMax: 0 };
  }
}
