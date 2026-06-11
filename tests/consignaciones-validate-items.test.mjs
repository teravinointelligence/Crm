// Pruebas del validador de items de consignación (Prioridad 1: bloquear $0.00).
// Corre con: npm test  (node --test usa type stripping para importar el .ts)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildConsignacionItems,
  PRECIO_CERO_ERROR,
} from "../app/api/consignaciones/_lib/validate-items.ts";

const linea = (overrides = {}) => ({
  producto_id: "prod-1",
  producto_nombre: "Vino Rosado Clos du Temple",
  cantidad: 5,
  precio_unitario: 250,
  ...overrides,
});

test("caso reportado: cantidad 5 + precio 0 → creación rechazada", () => {
  const r = buildConsignacionItems([linea({ precio_unitario: 0 })]);
  assert.equal(r.ok, false);
  assert.ok(r.error.includes(PRECIO_CERO_ERROR));
  assert.match(r.error, /Clos du Temple/);
});

test("precio negativo → rechazado", () => {
  const r = buildConsignacionItems([linea({ precio_unitario: -10 })]);
  assert.equal(r.ok, false);
});

test("precio no numérico → rechazado", () => {
  const r = buildConsignacionItems([linea({ precio_unitario: "abc" })]);
  assert.equal(r.ok, false);
});

test("un renglón válido + un renglón con precio 0 → rechazado (no basta el total > 0)", () => {
  const r = buildConsignacionItems([
    linea(),
    linea({ producto_id: "prod-2", producto_nombre: "Agricole", precio_unitario: 0 }),
  ]);
  assert.equal(r.ok, false);
  assert.match(r.error, /Agricole/);
});

test("cantidad 0 → rechazada", () => {
  const r = buildConsignacionItems([linea({ cantidad: 0 })]);
  assert.equal(r.ok, false);
  assert.match(r.error, /Cantidad inválida/);
});

test("sin items → rechazado", () => {
  const r = buildConsignacionItems([]);
  assert.equal(r.ok, false);
});

test("items válidos → ok con subtotales y total redondeados", () => {
  const r = buildConsignacionItems([
    linea({ cantidad: 3, precio_unitario: 199.99 }),
    linea({ producto_id: "prod-2", producto_nombre: "Agricole", cantidad: 2, precio_unitario: 0.01 }),
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].subtotal, 599.97);
  assert.equal(r.items[1].subtotal, 0.02);
  assert.equal(r.total, 599.99);
});

// --- aplicarPreciosCorregidos (corrección de heredadas en $0, Problema 3) ---

import { aplicarPreciosCorregidos } from "../app/api/consignaciones/_lib/validate-items.ts";

const itemCero = (overrides = {}) => ({
  producto_id: "p1",
  producto_nombre: "INNATO Tinto",
  cantidad: 12,
  precio_unitario: 0,
  subtotal: 0,
  ...overrides,
});

test("corrige precios de una consignación $0 → total recalculado, cantidades intactas", () => {
  const r = aplicarPreciosCorregidos(
    [itemCero(), itemCero({ producto_id: "p2", producto_nombre: "OJA Blanco", cantidad: 6 })],
    [
      { producto_id: "p1", precio_unitario: 250 },
      { producto_id: "p2", precio_unitario: 180.5 },
    ],
  );
  assert.equal(r.ok, true);
  assert.equal(r.items[0].cantidad, 12);
  assert.equal(r.items[0].subtotal, 3000);
  assert.equal(r.items[1].subtotal, 1083);
  assert.equal(r.total, 4083);
});

test("si un renglón queda sin corregir (sigue en $0) → rechazado", () => {
  const r = aplicarPreciosCorregidos(
    [itemCero(), itemCero({ producto_id: "p2", producto_nombre: "OJA Blanco" })],
    [{ producto_id: "p1", precio_unitario: 250 }],
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /OJA Blanco/);
});

test("precio corregido inválido (negativo) → rechazado", () => {
  const r = aplicarPreciosCorregidos([itemCero()], [{ producto_id: "p1", precio_unitario: -5 }]);
  assert.equal(r.ok, false);
});

test("sin items → rechazado", () => {
  const r = aplicarPreciosCorregidos([], [{ producto_id: "p1", precio_unitario: 100 }]);
  assert.equal(r.ok, false);
});

test("renglón con precio bueno se conserva si no se manda corrección para él", () => {
  const r = aplicarPreciosCorregidos(
    [itemCero({ precio_unitario: 300, subtotal: 3600 }), itemCero({ producto_id: "p2" })],
    [{ producto_id: "p2", precio_unitario: 99 }],
  );
  assert.equal(r.ok, true);
  assert.equal(r.items[0].precio_unitario, 300);
  assert.equal(r.items[1].precio_unitario, 99);
});
