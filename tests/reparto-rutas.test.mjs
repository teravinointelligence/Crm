// Pruebas de los helpers del tablero Reparto › Rutas (bugs de fecha y rezagados).
// Corre con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESTATUS_PENDIENTES,
  esRezagado,
  combinarConRezagados,
  buildRutasUrl,
} from "../lib/reparto-rutas.ts";

// --- esRezagado ---

test("pedido de fecha anterior a la operación → rezagado", () => {
  assert.equal(esRezagado({ fecha: "2026-06-09" }, "2026-06-11"), true);
});

test("pedido del mismo día → NO rezagado", () => {
  assert.equal(esRezagado({ fecha: "2026-06-11" }, "2026-06-11"), false);
});

test("pedido de fecha futura → NO rezagado", () => {
  assert.equal(esRezagado({ fecha: "2026-06-12" }, "2026-06-11"), false);
});

test("sin fecha → NO rezagado (no truena)", () => {
  assert.equal(esRezagado({ fecha: "" }, "2026-06-11"), false);
});

// --- combinarConRezagados ---

test("combina rezagados primero + los del día, sin duplicar ids", () => {
  const delDia = [{ id: "a" }, { id: "b" }];
  const rezagados = [{ id: "z" }, { id: "a" }]; // "a" duplicado: gana el del día
  const r = combinarConRezagados(delDia, rezagados);
  assert.deepEqual(r.map((p) => p.id), ["z", "a", "b"]);
});

test("sin rezagados, la lista del día queda intacta (filtro por fecha no se rompe)", () => {
  const delDia = [{ id: "a" }, { id: "b" }];
  const r = combinarConRezagados(delDia, []);
  assert.deepEqual(r.map((p) => p.id), ["a", "b"]);
});

// --- buildRutasUrl (la URL es la única fuente de verdad de fecha + toggle) ---

test("URL con fecha nueva en un solo paso (sin estado intermedio que se desfase)", () => {
  assert.equal(buildRutasUrl("2026-06-10", false), "/reparto/rutas?fecha=2026-06-10");
});

test("URL preserva el toggle de rezagados al cambiar la fecha", () => {
  assert.equal(buildRutasUrl("2026-06-10", true), "/reparto/rutas?fecha=2026-06-10&rezagados=1");
});

test("URL sin parámetros cuando no hay fecha ni toggle", () => {
  assert.equal(buildRutasUrl("", false), "/reparto/rutas");
});

// --- estatus pendientes (contrato con la consulta del server) ---

test("los rezagados solo consideran estatus pendientes de entrega", () => {
  assert.deepEqual([...ESTATUS_PENDIENTES], ["pendiente_asignar", "asignado", "en_ruta"]);
});
