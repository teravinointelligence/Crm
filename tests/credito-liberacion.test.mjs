import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarRiesgo, semaforoCobranza } from "../lib/cobranza.ts";

test("cualquier pago positivo libera el crédito", () => {
  for (const totalPagado of [0.01, 1, 25000]) {
    const result = clasificarRiesgo({
      totalPagado,
      diasVencido: 180,
      saldoVencido: 100000,
    });
    assert.equal(result.clase, "Crédito Liberado");
  }
});

test("el semáforo operativo aplica la misma regla de pagos", () => {
  assert.equal(semaforoCobranza(100, 50000, 0.01).bloquea, false);
  assert.equal(semaforoCobranza(0, 50000, 0).bloquea, true);
});

test("sin pagos el crédito no se libera", () => {
  for (const totalPagado of [0, null, undefined]) {
    const result = clasificarRiesgo({
      totalPagado,
      diasVencido: 0,
      saldoVencido: 0,
      isLegacy: true,
    });
    assert.equal(result.clase, "Suspender Crédito");
  }
});

test("un pago en los últimos 30 días libera aunque el consolidado siga en cero", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  const result = clasificarRiesgo({
    totalPagado: 0,
    ultimoPagoFecha: "2026-08-01",
    now,
    diasVencido: 70,
    saldoVencido: 50000,
  });
  assert.equal(result.clase, "Crédito Liberado");
  assert.equal(semaforoCobranza(70, 50000, 0, "2026-08-01", now).label, "Crédito liberado");
});

test("un pago de más de 30 días no libera por la regla de pago reciente", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  assert.equal(semaforoCobranza(70, 50000, 0, "2026-07-24", now).bloquea, true);
});
