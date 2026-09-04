// Pruebas de las reglas de las tareas del vendedor ("Mi día"). npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIN_FACTURAR_DAYS,
  addDays,
  compareTasks,
  dedupeKey,
  inactivePriority,
  isoWeekKey,
  monthKey,
  outcomesForSource,
  overdueDays,
  prospectPriority,
  sinFacturarPriority,
} from "../lib/rep-tasks.ts";

test("la semana ISO agrupa lunes a domingo", () => {
  // 2026-08-10 es lunes; 2026-08-16 domingo de la misma semana.
  assert.equal(isoWeekKey("2026-08-10"), isoWeekKey("2026-08-16"));
  // El lunes siguiente ya es otra semana.
  assert.notEqual(isoWeekKey("2026-08-10"), isoWeekKey("2026-08-17"));
});

test("la semana ISO cruza bien el fin de año", () => {
  // 2026-12-31 (jueves) pertenece a la semana 53 de 2026.
  assert.equal(isoWeekKey("2026-12-31"), "2026-W53");
  // 2027-01-01 (viernes) sigue en esa misma semana ISO.
  assert.equal(isoWeekKey("2027-01-01"), "2026-W53");
});

test("cobranza dedupea por mes y el resto por semana", () => {
  assert.equal(monthKey("2026-08-13"), "2026-08");
  assert.equal(dedupeKey("cobranza", "acct-1", "2026-08-13"), "cobranza:acct-1:2026-08");
  assert.equal(
    dedupeKey("cobranza", "acct-1", "2026-08-28"),
    dedupeKey("cobranza", "acct-1", "2026-08-13"),
    "dos días del mismo mes no deben crear dos tareas de cobranza",
  );
  assert.notEqual(
    dedupeKey("prospecto", "acct-1", "2026-08-10"),
    dedupeKey("prospecto", "acct-1", "2026-08-17"),
    "un prospecto olvidado debe volver a salir la semana siguiente",
  );
});

test("entre más olvidado, más prioridad", () => {
  assert.ok(prospectPriority(40) > prospectPriority(15));
  assert.ok(inactivePriority(60) > inactivePriority(20));
  // Nunca se pasa de 100 ni baja de 0.
  assert.ok(prospectPriority(9999) <= 100);
  assert.ok(inactivePriority(0) >= 0);
  // Un prospecto pesa más que un cliente inactivo con el mismo abandono.
  assert.ok(prospectPriority(60) > inactivePriority(60));
});

test("la prioridad distingue de verdad y no se pega al tope", () => {
  // El problema real: con una pendiente agresiva, cuentas de 90 y de 150 días
  // salían las dos en 100 y el orden del día quedaba al azar.
  const noventa = prospectPriority(90);
  const treinta = prospectPriority(30);
  assert.ok(noventa < 100, `90 días no debe toparse en 100 (dio ${noventa})`);
  assert.ok(noventa - treinta >= 20, "debe haber separación clara entre 30 y 90 días");
});

test("el orden del día pone primero lo vencido y luego lo urgente", () => {
  const tasks = [
    { due_date: "2026-08-13", priority: 90, created_at: "1" },
    { due_date: "2026-08-10", priority: 10, created_at: "2" },
    { due_date: "2026-08-13", priority: 95, created_at: "3" },
  ];
  const orden = tasks.slice().sort(compareTasks).map((t) => t.created_at);
  assert.deepEqual(orden, ["2", "3", "1"]);
});

test("los días de atraso solo cuentan hacia atrás", () => {
  assert.equal(overdueDays("2026-08-10", "2026-08-13"), 3);
  assert.equal(overdueDays("2026-08-13", "2026-08-13"), 0);
  assert.equal(overdueDays("2026-08-20", "2026-08-13"), 0);
});

test("posponer suma días sin salirse del mes", () => {
  assert.equal(addDays("2026-08-30", 3), "2026-09-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("cada tipo de tarea ofrece resultados que le hacen sentido", () => {
  assert.ok(outcomesForSource("cobranza").includes("promesa_pago"));
  assert.ok(!outcomesForSource("cobranza").includes("sin_interes"));
  assert.ok(outcomesForSource("prospecto").includes("agendo_cita"));
  assert.ok(!outcomesForSource("prospecto").includes("pago_recibido"));
});

test("la alerta de facturación se dedupea por mes, no por semana", () => {
  // El umbral es un mes: si la tarea volviera cada semana, el vendedor vería
  // cuatro veces el mismo cliente antes de que cambiara nada.
  assert.equal(
    dedupeKey("sin_facturar", "acct-1", "2026-08-03"),
    dedupeKey("sin_facturar", "acct-1", "2026-08-28"),
  );
  assert.notEqual(
    dedupeKey("sin_facturar", "acct-1", "2026-08-28"),
    dedupeKey("sin_facturar", "acct-1", "2026-09-01"),
  );
});

test("sin facturar pesa más que inactivo con los mismos días", () => {
  // Perder la venta es peor que perder el contacto: la alerta de facturación
  // tiene que salir arriba en el día del vendedor.
  assert.ok(sinFacturarPriority(SIN_FACTURAR_DAYS) > inactivePriority(SIN_FACTURAR_DAYS));
});

test("la prioridad de sin facturar sube con los días y no se pasa de 100", () => {
  assert.ok(sinFacturarPriority(60) > sinFacturarPriority(SIN_FACTURAR_DAYS));
  assert.ok(sinFacturarPriority(5000) <= 100);
  assert.ok(sinFacturarPriority(SIN_FACTURAR_DAYS) >= 0);
});

test("cerrar una tarea de sin facturar ofrece resultados de reactivación", () => {
  assert.deepEqual(outcomesForSource("sin_facturar"), outcomesForSource("inactivo"));
});
