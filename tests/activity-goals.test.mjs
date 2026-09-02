import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activityGoalStatus,
  buildWeeklyActivityGoalSnapshot,
  isQualifiedActivity,
  mondayOf,
} from "../lib/activity-goals.ts";

const row = (overrides = {}) => ({
  id: crypto.randomUUID(),
  sales_rep_id: "rep-1",
  account_id: "account-1",
  activity_type: "visita",
  activity_date: "2026-09-08T17:00:00.000Z",
  completed_at: "2026-09-08T18:00:00.000Z",
  status: "realizada",
  outcome: "Presentación realizada",
  next_step: null,
  ...overrides,
});

test("la semana corre de lunes a domingo y el piloto tiene tres estados", () => {
  assert.equal(mondayOf("2026-09-10"), "2026-09-07");
  assert.equal(activityGoalStatus("2026-08-23", "2026-09-07", "2026-10-04"), "upcoming");
  assert.equal(activityGoalStatus("2026-09-15", "2026-09-07", "2026-10-04"), "active");
  assert.equal(activityGoalStatus("2026-10-05", "2026-09-07", "2026-10-04"), "ended");
});

test("solo cuenta una actividad realizada con resultado o siguiente paso", () => {
  assert.equal(isQualifiedActivity(row()), true);
  assert.equal(isQualifiedActivity(row({ outcome: null, next_step: "Enviar cotización" })), true);
  assert.equal(isQualifiedActivity(row({ outcome: "", next_step: null })), false);
  assert.equal(isQualifiedActivity(row({ status: "agendada" })), false);
});

test("separa realizadas de agendadas y no duplica contactos rutinarios", () => {
  const snapshot = buildWeeklyActivityGoalSnapshot({
    repId: "rep-1",
    repName: "Félix",
    goal: 15,
    effectiveFrom: "2026-09-07",
    effectiveTo: "2026-10-04",
    todayKey: "2026-09-10",
    activities: [
      row({ id: "visit-1" }),
      row({ id: "call-1", activity_type: "llamada" }),
      row({ id: "wa-1", activity_type: "whatsapp" }),
      row({ id: "empty", account_id: "account-2", outcome: null, next_step: null }),
      row({
        id: "scheduled",
        account_id: "account-3",
        status: "agendada",
        activity_date: "2026-09-11T17:00:00.000Z",
        completed_at: null,
        outcome: null,
      }),
    ],
  });
  assert.equal(snapshot.completed, 2);
  assert.equal(snapshot.scheduled, 1);
  assert.equal(snapshot.unqualified, 1);
  assert.equal(snapshot.distinctAccounts, 1);
  assert.equal(snapshot.remaining, 13);
});

test("una visita de cobranza documentada cuenta como actividad independiente", () => {
  const snapshot = buildWeeklyActivityGoalSnapshot({
    repId: "rep-1",
    repName: "Andra",
    goal: 15,
    effectiveFrom: "2026-09-07",
    effectiveTo: "2026-10-04",
    todayKey: "2026-09-10",
    activities: [
      row({ id: "collection-1", activity_type: "visita_cobranza", outcome: "Promesa de pago" }),
      row({ id: "collection-2", activity_type: "visita_cobranza", outcome: "Entregó comprobante" }),
    ],
  });

  assert.equal(snapshot.completed, 2);
  assert.deepEqual(snapshot.breakdown, [
    { type: "visita_cobranza", label: "Visitas de cobranza", count: 2 },
  ]);
});

test("antes del piloto el círculo prepara la primera semana", () => {
  const snapshot = buildWeeklyActivityGoalSnapshot({
    repId: "rep-1",
    repName: "Saulo",
    goal: 12,
    effectiveFrom: "2026-09-07",
    effectiveTo: "2026-10-04",
    todayKey: "2026-08-23",
    activities: [],
  });
  assert.equal(snapshot.status, "upcoming");
  assert.equal(snapshot.weekStart, "2026-09-07");
  assert.equal(snapshot.weekEnd, "2026-09-13");
  assert.equal(snapshot.history.length, 1);
});
