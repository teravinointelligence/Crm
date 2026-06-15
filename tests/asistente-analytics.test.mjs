// Pruebas de los helpers puros del asistente. npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { productDeclines, normForSearch } from "../lib/asistente/analytics.ts";

const rows = [
  { codigo: "A", nombre: "Malbec", period: "2026-04", total: 10000 },
  { codigo: "A", nombre: "Malbec", period: "2026-05", total: 3000 },
  { codigo: "B", nombre: "Chardonnay", period: "2026-04", total: 5000 },
  { codigo: "B", nombre: "Chardonnay", period: "2026-05", total: 8000 }, // subió → no cae
  { codigo: "C", nombre: "Tinto chico", period: "2026-04", total: 100 }, // por debajo del mínimo
  { codigo: "C", nombre: "Tinto chico", period: "2026-05", total: 0 },
];

test("productDeclines detecta caídas mes vs mes y ordena por caída", () => {
  const d = productDeclines(rows, 500);
  assert.equal(d.length, 1); // solo A (B subió, C por debajo del mínimo)
  assert.equal(d[0].codigo, "A");
  assert.equal(Math.round(d[0].dropPct * 100), 70);
});

test("productDeclines vacío con menos de 2 periodos", () => {
  assert.deepEqual(productDeclines([{ codigo: "A", nombre: "x", period: "2026-05", total: 100 }]), []);
});

test("normForSearch quita acentos y baja a minúsculas", () => {
  assert.equal(normForSearch("Río Tinto Ñ"), "rio tinto ñ".normalize("NFD").replace(/[̀-ͯ]/g, ""));
  assert.equal(normForSearch("  HOTEL  "), "hotel");
});
