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
): SemaforoInfo {
  const dv = Number(diasVencido ?? 0);
  const pend = Number(saldoPendiente ?? 0);

  if (dv >= 45) return { estado: "suspendido", label: "Suspendido", variant: "danger", bloquea: true };
  if (dv >= 7) return { estado: "vencido", label: `Vencido (${dv} días)`, variant: "danger", bloquea: true };
  if (dv >= 1) return { estado: "alerta", label: `Alerta (${dv} días)`, variant: "warning", bloquea: false };
  if (pend > 0) return { estado: "por_cobrar", label: "Por cobrar", variant: "warning", bloquea: false };
  return { estado: "al_corriente", label: "Al corriente", variant: "success", bloquea: false };
}

// =====================================================================
// Clasificación de riesgo de cartera (Flujo 3 — estado de cuenta).
//
//   Cartera Legacy  → cuenta legacy/estratégica; se excluye de métricas
//                     operativas y NO entra a la lógica de suspensión.
//   Crédito Liberado→ al corriente o sin saldo vencido material.
//   Por Revisar     → saldo vencido dentro de la ventana de revisión
//                     [ventanaRevision, ventanaSuspension]. NO se suspende
//                     (regla 13).
//   Suspender Crédito → saldo vencido más allá de la ventana de revisión.
//
// El umbral de "Por Revisar" es configurable por cliente (default 45 días)
// para resolver la pregunta abierta 45 (regla) vs 32 (bucket) sin cablearla.
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
  diasVencido: number | null | undefined;
  saldoVencido: number | null | undefined;
  isLegacy?: boolean | null;
  ventanaRevision?: number | null;
  ventanaSuspension?: number | null;
}): RiesgoInfo {
  const dv = Number(params.diasVencido ?? 0);
  const vencido = Number(params.saldoVencido ?? 0);
  const inicio = Number(params.ventanaRevision ?? VENTANA_REVISION_DEFAULT);
  const fin = Number(params.ventanaSuspension ?? VENTANA_SUSPENSION_DEFAULT);

  if (params.isLegacy) {
    return {
      clase: "Cartera Legacy",
      variant: "muted",
      detalle: "Cuenta legacy/estratégica · excluida de métricas operativas",
    };
  }
  if (vencido <= 0 || dv < inicio) {
    return {
      clase: "Crédito Liberado",
      variant: "success",
      detalle: vencido > 0 ? `Vencido ${dv} días (dentro de tolerancia)` : "Sin saldo vencido material",
    };
  }
  if (dv <= fin) {
    return {
      clase: "Por Revisar",
      variant: "warning",
      detalle: `Vencido ${dv} días · en ventana de revisión (${inicio}–${fin})`,
    };
  }
  return {
    clase: "Suspender Crédito",
    variant: "danger",
    detalle: `Vencido ${dv} días · más allá de la ventana de revisión (${fin})`,
  };
}
