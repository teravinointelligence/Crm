// Tipos y catálogos del módulo Visitas de proveedor + Eventos (mig 0084).
// Las cifras/labels viven aquí para compartirlas entre páginas y componentes.

export type VisitStatus =
  | "planning"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  planning: "Planeación",
  confirmed: "Confirmada",
  in_progress: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
};

export const VISIT_STATUS_BADGE: Record<VisitStatus, "default" | "success" | "warning" | "danger" | "muted"> = {
  planning: "warning",
  confirmed: "default",
  in_progress: "success",
  completed: "muted",
  cancelled: "danger",
};

export type ActivityType =
  | "comida"
  | "cena"
  | "presentacion"
  | "capacitacion"
  | "reunion"
  | "traslado"
  | "otro";

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  comida: "Comida / Lunch",
  cena: "Cena maridaje",
  presentacion: "Presentación",
  capacitacion: "Capacitación",
  reunion: "Reunión",
  traslado: "Traslado",
  otro: "Otro",
};

export const ACTIVITY_TYPE_OPTIONS = Object.entries(ACTIVITY_TYPE_LABEL).map(
  ([value, label]) => ({ value: value as ActivityType, label }),
);

export type ActivityStatus = "pending" | "confirmed" | "cancelled";

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  pending: "Por confirmar",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
};

export const ACTIVITY_STATUS_BADGE: Record<ActivityStatus, "default" | "success" | "warning" | "danger" | "muted"> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "danger",
};

// Color de fondo por tipo de actividad para el calendario combinado.
export const ACTIVITY_TYPE_COLOR: Record<ActivityType, { bg: string; fg: string }> = {
  comida: { bg: "#e0f2fe", fg: "#075985" },
  cena: { bg: "#fae8ff", fg: "#86198f" },
  presentacion: { bg: "#dcfce7", fg: "#166534" },
  capacitacion: { bg: "#fef9c3", fg: "#854d0e" },
  reunion: { bg: "#e5e7eb", fg: "#374151" },
  traslado: { bg: "#ffedd5", fg: "#9a3412" },
  otro: { bg: "#f1f5f9", fg: "#334155" },
};

export type EventType =
  | "winemaker_dinner"
  | "winemaker_lunch"
  | "new_wine_launch"
  | "private_event"
  | "cena_maridaje"
  | "lunch_maridaje"
  | "winery_visit"
  | "training"
  | "festival_public"
  | "tbc";

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  winemaker_dinner: "Cena con enólogo",
  winemaker_lunch: "Lunch con enólogo",
  new_wine_launch: "Lanzamiento de vino",
  private_event: "Evento privado",
  cena_maridaje: "Cena maridaje",
  lunch_maridaje: "Lunch maridaje",
  winery_visit: "Visita de bodega",
  training: "Capacitación",
  festival_public: "Festival / público",
  tbc: "Por definir",
};

export const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_LABEL).map(
  ([value, label]) => ({ value: value as EventType, label }),
);

export type EventStatus =
  | "upcoming"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "postponed"
  | "tbc";

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  upcoming: "Próximo",
  confirmed: "Confirmado",
  completed: "Completado",
  cancelled: "Cancelado",
  postponed: "Pospuesto",
  tbc: "Por definir",
};

export const EVENT_STATUS_BADGE: Record<EventStatus, "default" | "success" | "warning" | "danger" | "muted"> = {
  upcoming: "warning",
  confirmed: "default",
  completed: "muted",
  cancelled: "danger",
  postponed: "warning",
  tbc: "muted",
};

export type ConfirmationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "reconfirmed"
  | "last_minute_cancel"
  | "expired"
  | "waitlist";

export const CONFIRMATION_STATUS_LABEL: Record<ConfirmationStatus, string> = {
  pending: "Pendiente",
  accepted: "Confirmó",
  declined: "Declinó",
  reconfirmed: "Reconfirmó",
  last_minute_cancel: "Canceló a última hora",
  expired: "Expiró",
  waitlist: "Lista de espera",
};

export const CONFIRMATION_STATUS_BADGE: Record<ConfirmationStatus, "default" | "success" | "warning" | "danger" | "muted"> = {
  pending: "warning",
  accepted: "success",
  declined: "danger",
  reconfirmed: "success",
  last_minute_cancel: "danger",
  expired: "muted",
  waitlist: "default",
};

// Tipos de fila (mínimos) usados por los componentes.
export type AccountOption = {
  id: string;
  business_name: string;
  region?: string | null;
};

export type RepOption = {
  id: string;
  full_name: string | null;
};

export type SupplierVisit = {
  id: string;
  provider_name: string;
  winery_brand: string | null;
  arrival_date: string;
  departure_date: string;
  city: string;
  coordinator_id: string | null;
  status: VisitStatus;
  notes: string | null;
};

export type VisitActivity = {
  id: string;
  visit_id: string;
  event_id: string | null;
  day_date: string;
  start_time: string | null;
  end_time: string | null;
  activity_type: ActivityType;
  title: string;
  account_id: string | null;
  client_name: string | null;
  location: string | null;
  city: string | null;
  status: ActivityStatus;
  notes: string | null;
  sort_order: number;
};
