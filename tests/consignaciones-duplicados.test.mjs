// Pruebas del detector de consignaciones duplicadas (Problema 2 de limpieza).
// Corre con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectarDuplicadas,
  idsEnDuplicados,
} from "../app/api/consignaciones/_lib/duplicados.ts";

const consig = (overrides = {}) => ({
  id: "c-1",
  cliente_nombre: "LA QUERENCIA",
  vendedor_id: "v-emmanuel",
  fecha: "2026-05-05",
  total: 0,
  ...overrides,
});

test("caso LA QUERENCIA: 2 consignaciones idénticas con cliente_id distinto → 1 grupo", () => {
  // El cliente está duplicado en Base44, así que cliente_id NO coincide;
  // el detector agrupa por nombre normalizado.
  const grupos = detectarDuplicadas([
    consig({ id: "q1" }),
    consig({ id: "q2", cliente_nombre: "La Querencia, S.A. de C.V." }),
    consig({ id: "otro", cliente_nombre: "NEMI", total: 0 }),
  ]);
  assert.equal(grupos.length, 1);
  assert.deepEqual(grupos[0].consignaciones.map((c) => c.id).sort(), ["q1", "q2"]);
  assert.deepEqual([...idsEnDuplicados(grupos)].sort(), ["q1", "q2"]);
});

test("total distinto → NO es duplicado", () => {
  const grupos = detectarDuplicadas([consig({ id: "a" }), consig({ id: "b", total: 1500 })]);
  assert.equal(grupos.length, 0);
});

test("fecha distinta → NO es duplicado", () => {
  const grupos = detectarDuplicadas([consig({ id: "a" }), consig({ id: "b", fecha: "2026-05-06" })]);
  assert.equal(grupos.length, 0);
});

test("vendedor distinto → NO es duplicado", () => {
  const grupos = detectarDuplicadas([consig({ id: "a" }), consig({ id: "b", vendedor_id: "v-otro" })]);
  assert.equal(grupos.length, 0);
});

test("las archivadas no cuentan (duplicado ya resuelto desaparece del aviso)", () => {
  const grupos = detectarDuplicadas([
    consig({ id: "a" }),
    consig({ id: "b", archivada: true }),
  ]);
  assert.equal(grupos.length, 0);
});

test("trío idéntico → un solo grupo de 3", () => {
  const grupos = detectarDuplicadas([
    consig({ id: "a" }),
    consig({ id: "b" }),
    consig({ id: "c" }),
  ]);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].consignaciones.length, 3);
});

test("sin nombre de cliente no se agrupa (no hay criterio confiable)", () => {
  const grupos = detectarDuplicadas([
    consig({ id: "a", cliente_nombre: undefined }),
    consig({ id: "b", cliente_nombre: undefined }),
  ]);
  assert.equal(grupos.length, 0);
});
