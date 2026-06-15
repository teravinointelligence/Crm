// Pruebas del emparejador catálogo ↔ código CONTPAQ. npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchContpaqRows, normalizeName } from "../lib/contpaq-map.ts";

const products = [
  { id: "p1", sku: "TAPIZ-BLACK-TEARS-MALBEC-750", name: "Tapiz Black Tears Malbec", codigo_contpaqi: null },
  { id: "p2", sku: "CLOUDY-BAY-SB-2022-750", name: "Cloudy Bay Sauvignon Blanc 2022", codigo_contpaqi: null },
  { id: "p3", sku: "IVON-LESCOMPTE-BRUT-750", name: "Ivon Lescompte Brut", codigo_contpaqi: "OLD-1" },
];

test("match exacto por SKU (clave del export == products.sku)", () => {
  const [m] = matchContpaqRows({ products, rows: [{ codigo: "TL01", clave: "TAPIZ-BLACK-TEARS-MALBEC-750", nombre: "lo que sea" }] });
  assert.equal(m.product_id, "p1");
  assert.equal(m.via, "sku");
  assert.equal(m.score, 1);
});

test("match exacto por nombre normalizado", () => {
  const [m] = matchContpaqRows({ products, rows: [{ codigo: "CB22", clave: null, nombre: "CLOUDY BAY SAUVIGNON BLANC 2022 06/750 ML" }] });
  assert.equal(m.product_id, "p2");
  assert.equal(m.via, "nombre");
});

test("fuzzy por nombre supera el umbral (nombre parecido, no idéntico)", () => {
  const [m] = matchContpaqRows({ products, rows: [{ codigo: "IL02", clave: null, nombre: "IVON LESCOMPTE BRUT NATURE 12/750 ML" }] });
  assert.equal(m.product_id, "p3");
  assert.equal(m.via, "fuzzy");
  assert.ok(m.score >= 0.6 && m.score < 1);
  assert.equal(m.alreadyMapped, true); // ya tenía OLD-1
});

test("nombre idéntico tras normalizar gana como match exacto (no fuzzy)", () => {
  const [m] = matchContpaqRows({ products, rows: [{ codigo: "IL02", clave: null, nombre: "IVON LESCOMPTE BRUT 12/750 ML" }] });
  assert.equal(m.product_id, "p3");
  assert.equal(m.via, "nombre");
});

test("no inventa match para nombres muy distintos (vino vs cerveza)", () => {
  const [m] = matchContpaqRows({ products, rows: [{ codigo: "303CERPERR", clave: null, nombre: "CERVEZA CLARA PERRO DEL MAR 24/355 ML" }] });
  assert.equal(m.product_id, null);
  assert.equal(m.via, "none");
});

test("normalizeName quita acentos, volumen y puntuación", () => {
  assert.equal(normalizeName("Gewürztraminer 06/750 ML"), "GEWURZTRAMINER");
});
