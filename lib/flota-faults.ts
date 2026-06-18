// Tipos y catálogos del reporte de fallas de vehículos (módulo Flota). Puro,
// sin server-only, para que el formulario cliente lo importe. La tabla vive en
// Supabase (migración 0073_fleet_fault_reports), no en Base44.

export const FAULT_TYPES = [
  "Servicio / mantenimiento",
  "Cambio de aceite",
  "Llantas",
  "Frenos",
  "Eléctrico / batería",
  "Carrocería",
  "Otro",
] as const;
export type FaultType = (typeof FAULT_TYPES)[number];

export const FAULT_URGENCY = ["baja", "media", "alta"] as const;
export type FaultUrgency = (typeof FAULT_URGENCY)[number];

export const URGENCY_LABEL: Record<FaultUrgency, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

export const FAULT_STATUS = ["reportado", "en_proceso", "atendido", "descartado"] as const;
export type FaultStatus = (typeof FAULT_STATUS)[number];

export const STATUS_LABEL: Record<FaultStatus, string> = {
  reportado: "Reportado",
  en_proceso: "En proceso",
  atendido: "Atendido",
  descartado: "Descartado",
};

export type FaultReport = {
  id: string;
  vehicle_id: string | null;
  vehicle_label: string;
  fault_type: string;
  description: string;
  urgency: FaultUrgency;
  km: number | null;
  status: FaultStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  reported_by: string | null;
  reporter_name?: string | null;
};
