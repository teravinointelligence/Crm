// Pruebas del emparejador de tomas huérfanas ↔ consignaciones (Prioridad 2).
// Corre con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarNombre,
  sugerirConsignaciones,
} from "../app/api/consignaciones/_lib/match-toma.ts";

const consig = (overrides = {}) => ({
  id: "c-1",
  cliente_id: "cli-1",
  cliente_nombre: "CASA DORADA",
  vendedor_id: "v-1",
  fecha: "2026-05-25",
  estado: "pendiente",
  ...overrides,
});

const toma = (overrides = {}) => ({
  cliente_id: "cli-1",
  cliente_nombre: "CASA DORADA",
  vendedor_id: "v-1",
  fecha_toma: "2026-05-27",
  ...overrides,
});

test("normaliza acentos, puntuación y stopwords corporativas", () => {
  assert.deepEqual(normalizarNombre("LA QUERENCIA, S.A. de C.V."), ["querencia"]);
  assert.deepEqual(normalizarNombre("Bosqué Café"), ["bosque", "cafe"]);
  assert.deepEqual(normalizarNombre(undefined), []);
});

test("mismo cliente_id es la candidata top", () => {
  const r = sugerirConsignaciones(toma(), [
    consig({ id: "otra", cliente_id: "cli-9", cliente_nombre: "NICKSAN" }),
    consig({ id: "match" }),
  ]);
  assert.equal(r[0].consignacion.id, "match");
  assert.ok(r[0].motivos.includes("Mismo cliente"));
});

test("sin cliente_id, matchea por nombre normalizado (caso TI-2026-CASADORADA)", () => {
  const r = sugerirConsignaciones(
    toma({ cliente_id: undefined, cliente_nombre: "Casa Dorada" }),
    [consig({ cliente_id: "cli-x" })],
  );
  assert.equal(r.length, 1);
  assert.ok(r[0].motivos.includes("Mismo nombre de cliente"));
});

test("cliente sin relación alguna NO es candidata", () => {
  const r = sugerirConsignaciones(toma({ cliente_id: undefined, cliente_nombre: "NEMI" }), [
    consig({ cliente_id: "cli-9", cliente_nombre: "GARZA BLANCA" }),
  ]);
  assert.equal(r.length, 0);
});

test("clientes duplicados (LA QUERENCIA ×2): el mismo vendedor rankea arriba", () => {
  const r = sugerirConsignaciones(
    toma({ cliente_id: undefined, cliente_nombre: "LA QUERENCIA", vendedor_id: "v-1" }),
    [
      consig({ id: "dup-otro-vendedor", cliente_id: "q-2", cliente_nombre: "LA QUERENCIA", vendedor_id: "v-9" }),
      consig({ id: "dup-mismo-vendedor", cliente_id: "q-1", cliente_nombre: "LA QUERENCIA", vendedor_id: "v-1" }),
    ],
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].consignacion.id, "dup-mismo-vendedor");
});

test("a igualdad de cliente y vendedor, gana la fecha más cercana", () => {
  const r = sugerirConsignaciones(toma({ fecha_toma: "2026-05-30" }), [
    consig({ id: "lejana", fecha: "2026-01-10" }),
    consig({ id: "cercana", fecha: "2026-05-28" }),
  ]);
  assert.equal(r[0].consignacion.id, "cercana");
});

test("consignación activa (pendiente/parcial) rankea sobre liquidada", () => {
  const r = sugerirConsignaciones(toma({ fecha_toma: undefined }), [
    consig({ id: "liquidada", estado: "liquidada", fecha: undefined }),
    consig({ id: "activa", estado: "pendiente", fecha: undefined }),
  ]);
  assert.equal(r[0].consignacion.id, "activa");
});

test("respeta el máximo de candidatas", () => {
  const lista = Array.from({ length: 10 }, (_, i) => consig({ id: `c-${i}` }));
  const r = sugerirConsignaciones(toma(), lista, 6);
  assert.equal(r.length, 6);
});
