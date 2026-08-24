// Lógica del semáforo de cartera (política de crédito TERAVINO).
//
//   días vencidos   estado        acción
//   0 (sin vencido) al corriente  —
//   1 – 6           alerta        recordatorio
//   7 – 44          vencido       bloqueo de nuevos pedidos
//   45+             suspendido    suspensión de cuenta

export type EstadoCobranza = "al_corriente" | "por_cobrar" | "alerta" | "vencido" | "suspendido";

export type SemaforoInfo = {
  estado: EstadoCobranza;
  label: string;
  variant: "success" | "warning" | "danger" | "muted";
  /** true cuando la política indica bloquear nuevos pedidos (7+ días). */
  bloquea: boolean;
};

export function semaforoCobranza(
  diasVencido: number | null | undefined,
  saldoPendiente: number | null | undefined,
  totalPagado?: number | null,
  ultimoPagoVencidoFecha?: string | null,
  now = new Date(),
): SemaforoInfo {
  const dv = Number(diasVencido ?? 0);
  const pend = Number(saldoPendiente ?? 0);

  if (ultimoPagoVencidoFecha !== undefined) {
    if (pagoEnUltimos30Dias(ultimoPagoVencidoFecha, now)) {
      return { estado: "al_corriente", label: "Crédito liberado", variant: "success", bloquea: false };
    }
    if (pend > 0) {
      return { estado: "suspendido", label: "Crédito suspendido", variant: "danger", bloquea: true };
    }
  } else if (totalPagado != null) {
    if (Number(totalPagado) > 0) {
      return { estado: "al_corriente", label: "Crédito liberado", variant: "success", bloquea: false };
    }
    if (pend > 0) {
      return { estado: "suspendido", label: "Sin crédito · ningún pago", variant: "danger", bloquea: true };
    }
  }

  if (dv >= 45) return { estado: "suspendido", label: "Suspendido", variant: "danger", bloquea: true };
  if (dv >= 7) return { estado: "vencido", label: `Vencido (${dv} días)`, variant: "danger", bloquea: true };
  if (dv >= 1) return { estado: "alerta", label: `Alerta (${dv} días)`, variant: "warning", bloquea: false };
  if (pend > 0) return { estado: "por_cobrar", label: "Por cobrar", variant: "warning", bloquea: false };
  return { estado: "al_corriente", label: "Al corriente", variant: "success", bloquea: false };
}

export function pagoEnUltimos30Dias(
  ultimoPagoFecha: string | null | undefined,
  now = new Date(),
): boolean {
  if (!ultimoPagoFecha) return false;
  const fecha = new Date(`${String(ultimoPagoFecha).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return false;
  const hoyUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dias = Math.floor((hoyUtc - fecha.getTime()) / 86_400_000);
  return dias >= 0 && dias <= 30;
}

// =====================================================================
// Política vigente de crédito:
//   cualquier pago acumulado > 0 → crédito liberado
//   ningún pago acumulado         → crédito no liberado
// La evaluación es dinámica: el primer abono cambia la clasificación sin que
// alguien tenga que editar manualmente la cuenta.
// =====================================================================

export type ClaseRiesgo =
  | "Cartera Legacy"
  | "Crédito Liberado"
  | "Por Revisar"
  | "Suspender Crédito";

export type RiesgoInfo = {
  clase: ClaseRiesgo;
  variant: "success" | "warning" | "danger" | "muted";
  /** Descripción corta del porqué de la clasificación. */
  detalle: string;
};

export const VENTANA_REVISION_DEFAULT = 45;
export const VENTANA_SUSPENSION_DEFAULT = 62;

export function clasificarRiesgo(params: {
  totalPagado?: number | null;
  ultimoPagoVencidoFecha?: string | null;
  now?: Date;
  diasVencido: number | null | undefined;
  saldoVencido: number | null | undefined;
  isLegacy?: boolean | null;
  ventanaRevision?: number | null;
  ventanaSuspension?: number | null;
}): RiesgoInfo {
  const pagado = Number(params.totalPagado ?? 0);
  const usaReglaFacturaVencida = params.ultimoPagoVencidoFecha !== undefined;
  const pagoReciente = pagoEnUltimos30Dias(params.ultimoPagoVencidoFecha, params.now);
  if (pagoReciente || (!usaReglaFacturaVencida && pagado > 0)) {
    return {
      clase: "Crédito Liberado",
      variant: "success",
      detalle: pagoReciente
        ? "Crédito liberado · pagó una factura vencida en los últimos 30 días"
        : "Crédito liberado · la cuenta ya registró al menos un pago",
    };
  }
  return {
    clase: "Suspender Crédito",
    variant: "danger",
    detalle: usaReglaFacturaVencida
      ? "Crédito suspendido · no ha pagado una factura vencida en los últimos 30 días"
      : "Crédito no liberado · la cuenta no ha registrado ningún pago",
  };
}
