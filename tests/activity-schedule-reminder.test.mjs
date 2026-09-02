import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activityReminderIdempotencyKey,
  activityReminderWindow,
  buildActivityScheduleReminderEmail,
  countFutureActivities,
  nextReminderMonth,
  normalizeReminderMonth,
  reminderMonthLabel,
  reminderMonthState,
  summarizeActivityMonth,
} from "../lib/activity-schedule-reminder.ts";

const NOW = new Date("2026-09-02T15:00:00.000Z"); // 08:00 en Los Cabos

test("valida y avanza meses, incluido el cambio de año", () => {
  assert.equal(normalizeReminderMonth("2026-09"), "2026-09");
  assert.equal(normalizeReminderMonth("2026-13"), null);
  assert.equal(normalizeReminderMonth("septiembre"), null);
  assert.equal(nextReminderMonth("2026-12"), "2027-01");
  assert.equal(reminderMonthLabel("2026-09"), "septiembre de 2026");
});

test("distingue meses pasados, actual y futuros en hora de Los Cabos", () => {
  assert.equal(reminderMonthState("2026-08", NOW), "past");
  assert.equal(reminderMonthState("2026-09", NOW), "current");
  assert.equal(reminderMonthState("2026-10", NOW), "future");
});

test("el mes actual empieza ahora y termina al iniciar el siguiente mes local", () => {
  assert.deepEqual(activityReminderWindow("2026-09", NOW), {
    state: "current",
    eligible: true,
    startIso: "2026-09-02T15:00:00.000Z",
    endIso: "2026-10-01T07:00:00.000Z",
  });
});

test("un mes futuro usa el mes local completo y uno pasado no es elegible", () => {
  assert.deepEqual(activityReminderWindow("2026-10", NOW), {
    state: "future",
    eligible: true,
    startIso: "2026-10-01T07:00:00.000Z",
    endIso: "2026-11-01T07:00:00.000Z",
  });
  assert.equal(activityReminderWindow("2026-08", NOW).eligible, false);
});

test("cuenta solo actividades agendadas a futuro del mes", () => {
  const rows = [
    { activity_date: "2026-09-02T14:59:59.000Z", status: "realizada" },
    { activity_date: "2026-09-02T15:00:00.000Z", status: "agendada" },
    { activity_date: "2026-09-18T18:00:00.000Z", status: "agendada" },
    { activity_date: "2026-09-20T18:00:00.000Z", status: "cancelada" },
    { activity_date: "2026-09-21T18:00:00.000Z", status: "realizada" },
    { activity_date: "2026-10-02T18:00:00.000Z", status: "agendada" },
  ];
  assert.equal(countFutureActivities(rows, "2026-09", NOW), 2);
});

test("separa futuras agendadas, realizadas y siguientes pasos del mes", () => {
  const activities = [
    { activity_date: "2026-09-02T14:59:59.000Z", status: "realizada" },
    { activity_date: "2026-09-18T18:00:00.000Z", status: "agendada" },
    { activity_date: "2026-09-20T18:00:00.000Z", status: "cancelada" },
    // 00:30 UTC del 1/oct todavía es 30/sep en Los Cabos.
    { activity_date: "2026-10-01T00:30:00.000Z", status: "realizada" },
    { activity_date: "2026-10-02T18:00:00.000Z", status: "realizada" },
  ];
  const nextSteps = [
    { next_step_date: "2026-09-12" },
    { next_step_date: "2026-09-25" },
    { next_step_date: "2026-10-01" },
    { next_step_date: null },
  ];

  assert.deepEqual(summarizeActivityMonth(activities, nextSteps, "2026-09", NOW), {
    futureScheduled: 1,
    completed: 2,
    nextSteps: 2,
  });
});

test("el correo escapa datos, incluye el mes y enlaza al filtro correcto", () => {
  const message = buildActivityScheduleReminderEmail({
    sellerName: "Andra <Ventas>",
    sellerId: "rep 1",
    month: "2026-09",
    appUrl: "https://crm.example.com/",
  });
  assert.match(message.subject, /septiembre de 2026/);
  assert.match(message.html, /Andra &lt;Ventas&gt;/);
  assert.match(message.html, /actividades futuras agendadas/);
  assert.match(message.html, /visitas, llamadas, degustaciones y seguimientos/);
  assert.equal(
    message.calendarUrl,
    "https://crm.example.com/actividades/calendario?mes=2026-09&rep=rep+1",
  );
});

test("la clave anti-duplicado es estable por vendedor y mes", () => {
  const first = activityReminderIdempotencyKey("rep-1", "2026-09");
  const repeated = activityReminderIdempotencyKey("rep-1", "2026-09");
  const anotherMonth = activityReminderIdempotencyKey("rep-1", "2026-10");
  assert.equal(first, repeated);
  assert.notEqual(first, anotherMonth);
});
