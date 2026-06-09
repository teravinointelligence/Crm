// Tipos, enums y helpers puros del módulo Flota — SIN server-only, para que los
// componentes cliente (formularios de seguro/servicios) puedan importarlos sin
// arrastrar la API key. El cliente Base44 (server-only) vive en lib/base44-flota.ts
// y re-exporta todo esto.

// ----- Vehículo -----

export type FlotaVehicle = {
  id: string;
  brand: string;
  model: string;
  year: number;
  version?: string | null;
  plates?: string | null;
  vin?: string | null;
  holder?: string | null;
  location?: string | null;
  assigned_driver?: string | null;
  current_km?: number | null;
  estimated_value?: number | null;
  notes?: string | null;
  created_date?: string;
  updated_date?: string;
};

// Campos que un vehículo "debería" tener llenos para considerarse completo.
// El módulo Flota existe para que Logística complete justamente estos.
export const FLOTA_REQUIRED_FIELDS = [
  { key: "plates", label: "Placas" },
  { key: "vin", label: "No. de serie (VIN)" },
  { key: "holder", label: "Titular" },
  { key: "assigned_driver", label: "Conductor asignado" },
  { key: "location", label: "Plaza" },
  { key: "current_km", label: "Kilometraje" },
] as const satisfies ReadonlyArray<{ key: keyof FlotaVehicle; label: string }>;

function isBlank(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/** Devuelve las etiquetas de los campos importantes que están vacíos. */
export function missingFields(v: FlotaVehicle): string[] {
  return FLOTA_REQUIRED_FIELDS.filter((f) => isBlank(v[f.key])).map((f) => f.label);
}

// ----- Póliza de seguro -----

export const POLICY_COVERAGES = ["Amplia", "Limitada", "RC"] as const;
export type PolicyCoverage = (typeof POLICY_COVERAGES)[number];

export type FlotaInsurancePolicy = {
  id: string;
  vehicle_id: string;
  insurer: string;
  policy_number: string;
  coverage?: PolicyCoverage | null;
  insured_amount?: number | null;
  annual_premium?: number | null;
  payment_method?: string | null;
  start_date?: string | null;
  end_date?: string | null; // fin de vigencia / renovación
  documento_pdf?: string | null;
  notes?: string | null;
  created_date?: string;
  updated_date?: string;
};

// ----- Servicio mecánico / reparación -----

export const SERVICE_TYPES = [
  "Afinación",
  "Cambio de aceite",
  "Frenos",
  "Llantas",
  "Reparación",
  "Mantenimiento general",
  "Otro",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export type FlotaMechanicalService = {
  id: string;
  vehicle_id: string;
  date: string;
  service_type: ServiceType;
  description?: string | null;
  workshop?: string | null;
  cost?: number | null;
  km_at_service?: number | null;
  next_service_date?: string | null;
  documento_pdf?: string | null;
  notes?: string | null;
  created_date?: string;
  updated_date?: string;
};

/**
 * Días que faltan para una fecha (negativo si ya pasó). null si no hay fecha.
 * Útil para resaltar renovaciones de póliza o próximos servicios vencidos.
 */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
