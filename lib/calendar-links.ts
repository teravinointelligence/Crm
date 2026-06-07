// Enlace "Agregar a Google Calendar" (plantilla de evento). No requiere OAuth ni
// integración: abre Google Calendar con el evento prellenado en la cuenta de
// Google con la que el usuario esté logueado. Cada quien agrega sus citas.

function gcalStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  // Formato UTC: YYYYMMDDTHHMMSSZ (instante absoluto; Google lo muestra en la
  // zona del calendario del usuario).
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

export function googleCalendarUrl({
  title,
  startISO,
  durationMinutes,
  details,
  location,
}: {
  title: string;
  startISO: string;
  durationMinutes?: number | null;
  details?: string | null;
  location?: string | null;
}): string {
  const start = new Date(startISO);
  const mins = durationMinutes && durationMinutes > 0 ? durationMinutes : 60;
  const end = new Date(start.getTime() + mins * 60000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
  });
  if (details?.trim()) params.set("details", details.trim());
  if (location?.trim()) params.set("location", location.trim());
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
