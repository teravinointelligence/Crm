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
