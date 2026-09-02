// Reglas puras para el recordatorio mensual de actividades del vendedor.
// Se comparten entre el calendario, el endpoint de envío y las pruebas para
// evitar que la interfaz y la validación final cuenten cosas distintas.

const TIME_ZONE = "America/Mazatlan";

export type ReminderMonthState = "past" | "current" | "future";

export type ReminderActivity = {
  activity_date: string;
  status?: string | null;
};

export function normalizeReminderMonth(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? value : null;
}

export function reminderDateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function nextReminderMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

export function reminderMonthLabel(month: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}

export function reminderMonthState(month: string, now: Date): ReminderMonthState {
  const currentMonth = reminderDateKey(now).slice(0, 7);
  if (month < currentMonth) return "past";
  if (month > currentMonth) return "future";
  return "current";
}

function partsInTimeZone(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: TIME_ZONE,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** Convierte el inicio de un mes en Los Cabos a un instante UTC. */
function monthStartIso(month: string): string {
  const wallAsUtc = new Date(`${month}-01T00:00:00Z`);
  const parts = partsInTimeZone(wallAsUtc);
  const shownAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = shownAsUtc - wallAsUtc.getTime();
  return new Date(wallAsUtc.getTime() - offsetMs).toISOString();
}

export function activityReminderWindow(
  month: string,
  now: Date,
): { state: ReminderMonthState; eligible: boolean; startIso: string; endIso: string } {
  const state = reminderMonthState(month, now);
  return {
    state,
    eligible: state !== "past",
    startIso: state === "current" ? now.toISOString() : monthStartIso(month),
    endIso: monthStartIso(nextReminderMonth(month)),
  };
}

/** Cuenta solo actividades reales futuras; los "siguientes pasos" no llegan a este módulo. */
export function countFutureActivities(
  activities: ReminderActivity[],
  month: string,
  now: Date,
): number {
  const state = reminderMonthState(month, now);
  if (state === "past") return 0;

  return activities.filter((activity) => {
    if (activity.status === "cancelada") return false;
    const instant = new Date(activity.activity_date);
    if (Number.isNaN(instant.getTime())) return false;
    if (reminderDateKey(instant).slice(0, 7) !== month) return false;
    return state === "future" || instant.getTime() >= now.getTime();
  }).length;
}

export function activityReminderIdempotencyKey(
  repId: string,
  month: string,
): string {
  // Resend conserva esta clave durante 24 h; al mantenerla estable, también
  // protege los envíos hechos a ambos lados de la medianoche.
  return `activity-schedule-reminder-${repId}-${month}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ]!,
  );
}

export function buildActivityScheduleReminderEmail(input: {
  sellerName: string;
  sellerId: string;
  month: string;
  appUrl: string;
}): { subject: string; html: string; calendarUrl: string } {
  const monthLabel = reminderMonthLabel(input.month);
  const calendarUrl = `${input.appUrl.replace(/\/+$/, "")}/actividades/calendario?${new URLSearchParams({
    mes: input.month,
    rep: input.sellerId,
  }).toString()}`;
  const sellerName = escapeHtml(input.sellerName);
  const safeMonth = escapeHtml(monthLabel);
  const safeUrl = escapeHtml(calendarUrl);

  return {
    subject: `Recordatorio: registra tus actividades de ${monthLabel} en el CRM`,
    calendarUrl,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#222;font-size:15px;line-height:1.55;">
        <div style="font-size:22px;letter-spacing:4px;color:#7a1220;font-weight:700;margin-bottom:18px;">TERAVINO</div>
        <p>Hola ${sellerName},</p>
        <p>No aparecen actividades futuras registradas para <strong>${safeMonth}</strong>.</p>
        <p>Recuerda programar tus visitas, llamadas, degustaciones y seguimientos en el CRM.</p>
        <p style="margin:24px 0;">
          <a href="${safeUrl}" style="display:inline-block;background:#7a1220;color:#fff;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:6px;">Abrir calendario de actividades</a>
        </p>
        <p style="color:#666;font-size:13px;margin-top:28px;">TERAVINO · CRM</p>
      </div>`,
  };
}
