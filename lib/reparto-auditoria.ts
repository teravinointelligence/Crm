// Auditoría de entregas de Reparto: helpers puros (sin imports, se prueban con
// `node --test` — ver tests/reparto-auditoria.test.mjs).
//
// El problema que resuelve: un pedido solo pasa a "entregado" cuando el chofer
// sube la foto de la factura firmada y sellada (POST /api/reparto/pedidos/[id]/
// entregar crea la fila en reparto.entregas con foto_url). Si el chofer entrega
// físicamente pero no sube la evidencia, el pedido se queda clavado en
// "asignado" / "en ruta" y el CRM lo sigue reportando como pendiente de entrega.
// Estos helpers detectan justo esos pedidos: ya salió el día, no hay evidencia.

/** Estatus que significan "todavía no se cierra la entrega". */
export const ESTATUS_EN_CAMINO = ["asignado", "en_ruta"] as const;

/** A partir de cuántos días de atraso un pendiente se considera crítico. */
export const DIAS_CRITICO = 3;

export type SeveridadAuditoria = "critico" | "atrasado";

/** Lo mínimo que necesita un pedido para auditarse. */
export type PedidoAuditable = {
  id: string;
  estatus: string;
  /** Fecha de la factura/documento en formato AAAA-MM-DD. */
  fecha: string;
  /** ¿Ya tiene evidencia fotográfica cargada (entregas.foto_url)? */
  tieneFoto: boolean;
};

export type Auditado<T> = T & { dias: number; severidad: SeveridadAuditoria };

/**
 * Días transcurridos entre dos fechas AAAA-MM-DD. Se comparan como fechas UTC
 * puras (sin objetos locales) para que no cambie el resultado por zona horaria.
 * Devuelve 0 si alguna fecha no es válida.
 */
export function diasTranscurridos(fecha: string, hoy: string): number {
  const ms = (f: string): number | null => {
    if (!f || !/^\d{4}-\d{2}-\d{2}/.test(f)) return null;
    const t = Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));
    return Number.isNaN(t) ? null : t;
  };
  const a = ms(fecha);
  const b = ms(hoy);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Un pedido está "pendiente de subir evidencia" si sigue en camino (asignado o
 * en ruta), no tiene foto y su fecha ya quedó atrás. Los del día NO cuentan:
 * el chofer todavía anda en la ruta y es normal que no haya evidencia.
 */
export function esPendienteEvidencia(p: PedidoAuditable, hoy: string): boolean {
  if (p.tieneFoto) return false;
  if (!(ESTATUS_EN_CAMINO as readonly string[]).includes(p.estatus)) return false;
  return diasTranscurridos(p.fecha, hoy) >= 1;
}

/**
 * Pedido marcado como entregado pero sin foto en la bitácora: la entrega se
 * cerró a mano, sin la evidencia de factura firmada y sellada.
 */
export function esEntregadoSinEvidencia(p: PedidoAuditable): boolean {
  return p.estatus === "entregado" && !p.tieneFoto;
}

export function severidadPorDias(dias: number): SeveridadAuditoria {
  return dias >= DIAS_CRITICO ? "critico" : "atrasado";
}

/**
 * Filtra los pendientes de evidencia y los anota con días de atraso y
 * severidad, del más viejo al más reciente (lo más urgente primero).
 */
export function auditarPendientes<T extends PedidoAuditable>(pedidos: T[], hoy: string): Auditado<T>[] {
  return pedidos
    .filter((p) => esPendienteEvidencia(p, hoy))
    .map((p) => {
      const dias = diasTranscurridos(p.fecha, hoy);
      return { ...p, dias, severidad: severidadPorDias(dias) };
    })
    .sort((a, b) => b.dias - a.dias);
}

export type ResumenAuditoria = {
  total: number;
  criticos: number;
  enRuta: number;
  asignados: number;
  diasMax: number;
  /** Monto facturado detenido por falta de evidencia. */
  montoDetenido: number;
};

export function resumenAuditoria(
  items: Auditado<PedidoAuditable & { total?: number | null }>[],
): ResumenAuditoria {
  return {
    total: items.length,
    criticos: items.filter((i) => i.severidad === "critico").length,
    enRuta: items.filter((i) => i.estatus === "en_ruta").length,
    asignados: items.filter((i) => i.estatus === "asignado").length,
    diasMax: items.reduce((m, i) => Math.max(m, i.dias), 0),
    montoDetenido: items.reduce((s, i) => s + (Number(i.total) || 0), 0),
  };
}

export type ChoferAuditoria = {
  chofer_id: string | null;
  nombre: string;
  telefono: string | null;
  pedidos: number;
  diasMax: number;
};

/**
 * Agrupa los pendientes por chofer (los sin asignar caen en un grupo aparte),
 * ordenados por atraso máximo: a quién hay que recordarle primero.
 */
export function agruparPorChofer<
  T extends PedidoAuditable & { chofer: { id: string; nombre: string; telefono?: string | null } | null },
>(items: Auditado<T>[]): ChoferAuditoria[] {
  const mapa = new Map<string, ChoferAuditoria>();
  for (const i of items) {
    const key = i.chofer?.id ?? "sin_asignar";
    const actual = mapa.get(key);
    if (actual) {
      actual.pedidos++;
      actual.diasMax = Math.max(actual.diasMax, i.dias);
      // El teléfono puede venir solo en algunas filas; se conserva el primero útil.
      if (!actual.telefono && i.chofer) actual.telefono = telefonoChofer(i.chofer.nombre, i.chofer.telefono ?? null);
      continue;
    }
    mapa.set(key, {
      chofer_id: i.chofer?.id ?? null,
      nombre: i.chofer?.nombre ?? "Sin asignar",
      telefono: i.chofer ? telefonoChofer(i.chofer.nombre, i.chofer.telefono ?? null) : null,
      pedidos: 1,
      diasMax: i.dias,
    });
  }
  return [...mapa.values()].sort((a, b) => b.diasMax - a.diasMax || b.pedidos - a.pedidos);
}

/**
 * Choferes que operan sin correo (no reciben avisos por email): el recordatorio
 * les llega por WhatsApp. Es un respaldo — si el chofer ya tiene teléfono
 * capturado en Reparto › Choferes, ese gana siempre.
 */
export const TELEFONOS_CHOFER_RESPALDO: Record<string, string> = {
  anibal: "6243158521",
  gonzalo: "6242104491",
  martin: "3331420073",
};

/** Quita acentos y baja a minúsculas para comparar nombres. */
function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Teléfono con el que se le manda el recordatorio a un chofer: el capturado en
 * su ficha, y si no tiene, el del respaldo por nombre (Aníbal, Gonzalo, Martín).
 */
export function telefonoChofer(nombre: string, telefono: string | null): string | null {
  if (telefono && telefono.replace(/\D/g, "").length >= 10) return telefono;
  const norm = normalizarNombre(nombre ?? "");
  for (const [clave, tel] of Object.entries(TELEFONOS_CHOFER_RESPALDO)) {
    if (norm.includes(clave)) return tel;
  }
  return null;
}

/** Normaliza un teléfono mexicano a dígitos con lada país (52) para wa.me. */
export function numeroWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) d = "52" + d;
  else if (d.length === 11 && d.startsWith("1")) d = "52" + d.slice(1);
  else if (d.length === 13 && d.startsWith("521")) d = "52" + d.slice(3);
  return d;
}

/** Enlace wa.me listo para abrir, o null si no hay número usable. */
export function linkWhatsapp(telefono: string | null, mensaje: string): string | null {
  const num = numeroWhatsapp(telefono);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}

export type PedidoMensaje = {
  numero_factura: string;
  fecha: string;
  dias: number;
  cliente: string | null;
};

/**
 * Recordatorio que se le manda al chofer por WhatsApp. Es explícito en lo que
 * falta (foto de la factura con firma y sello) porque ese es justo el paso que
 * se están saltando y por el que el pedido no cierra.
 */
export function mensajeRecordatorio(nombreChofer: string, pedidos: PedidoMensaje[]): string {
  const nombre = (nombreChofer ?? "").trim().split(" ")[0] || "";
  const lista = pedidos
    .map(
      (p) =>
        `• ${p.numero_factura} — ${p.cliente ?? "cliente s/n"} (del ${p.fecha}, ${p.dias} día${p.dias === 1 ? "" : "s"})`,
    )
    .join("\n");
  const encabezado =
    pedidos.length === 1
      ? "tienes 1 pedido que sigue marcado como pendiente de entrega:"
      : `tienes ${pedidos.length} pedidos que siguen marcados como pendientes de entrega:`;
  return (
    `Hola ${nombre}, ${encabezado}\n\n${lista}\n\n` +
    "Falta subir la foto de la factura con la FIRMA y el SELLO del cliente. " +
    "Sin esa evidencia el pedido no se puede marcar como entregado y sigue apareciendo como pendiente en el sistema. " +
    "¿Nos la subes por favor? Gracias."
  );
}
