import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarRiesgo, semaforoCobranza } from "../lib/cobranza.ts";

test("la compatibilidad histórica conserva pagos positivos cuando no se consulta la regla nueva", () => {
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

test("sin saldo vencido el crédito se mantiene liberado", () => {
  for (const totalPagado of [0, null, undefined]) {
    const result = clasificarRiesgo({
      totalPagado,
      ultimoPagoVencidoFecha: null,
      diasVencido: 0,
      saldoVencido: 0,
      isLegacy: true,
    });
    assert.equal(result.clase, "Crédito Liberado");
  }
});

test("cliente 251 queda por cobrar y sin bloqueo cuando su saldo vencido es cero", () => {
  const result = semaforoCobranza(
    0,
    13144.69,
    228416.48,
    null,
    new Date("2026-08-24T12:00:00Z"),
  );
  assert.equal(result.label, "Por cobrar");
  assert.equal(result.bloquea, false);
});

test("el pago de una factura vencida en los últimos 30 días libera el crédito", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  const result = clasificarRiesgo({
    totalPagado: 0,
    ultimoPagoVencidoFecha: "2026-08-01",
    now,
    diasVencido: 70,
    saldoVencido: 50000,
  });
  assert.equal(result.clase, "Crédito Liberado");
  assert.equal(semaforoCobranza(70, 50000, 0, "2026-08-01", now).label, "Crédito liberado");
});

test("un pago de factura vencida de más de 30 días no libera el crédito", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  assert.equal(semaforoCobranza(70, 50000, 0, "2026-07-24", now).bloquea, true);
});

test("un pago reciente que no corresponde a una factura vencida no libera", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  const result = clasificarRiesgo({
    totalPagado: 5000,
    ultimoPagoVencidoFecha: null,
    now,
    diasVencido: 70,
    saldoVencido: 50000,
  });
  assert.equal(result.clase, "Suspender Crédito");
});

test("el plazo en contado prevalece sobre una liberación reciente", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  assert.equal(
    semaforoCobranza(0, 0, 1000, "2026-08-20", now, 0).label,
    "Sin crédito · contado",
  );
  const result = clasificarRiesgo({
    ultimoPagoVencidoFecha: "2026-08-20",
    now,
    diasVencido: 0,
    saldoVencido: 0,
    creditDays: 0,
  });
  assert.equal(result.clase, "Suspender Crédito");
  assert.match(result.detalle, /solo contado/);
});
