// Pruebas del modelo de reabasto (punto de reorden). npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReorder, buildRestockSuggestions, RESTOCK_PARAMS } from "../lib/restock.ts";

const prod = (over = {}) => ({
  product_id: "p",
  sku: "SKU",
  name: "Vino",
  supplier: "Bodega",
  stock: 100,
  velocityPerMonth: 30,
  leadDays: 30,
  ...over,
});

test("sin ventas → no sugiere reabasto", () => {
  const r = computeReorder(prod({ velocityPerMonth: 0, stock: 0 }));
  assert.equal(r.atRisk, false);
  assert.equal(r.urgency, "sin_riesgo");
  assert.equal(r.suggestedQty, 0);
});

test("stock holgado → sin riesgo", () => {
  // 30/mes = 1/día; 100 en stock = 100 días de cobertura, lead 30 → holgado.
  const r = computeReorder(prod({ stock: 100, velocityPerMonth: 30 }));
  assert.equal(r.atRisk, false);
  assert.equal(r.daysOfCover, 100);
});

test("va a quebrar antes del reabasto → en riesgo, con cantidad y fecha", () => {
  // 60/mes = 2/día; 20 en stock = 10 días de cobertura; lead 30 → quiebra seguro.
  const r = computeReorder(prod({ stock: 20, velocityPerMonth: 60, leadDays: 30 }));
  assert.equal(r.atRisk, true);
  assert.equal(r.urgency, "critico"); // orderBy ya pasó (cobertura 10 < lead+colchón)
  assert.ok(r.suggestedQty > 0);
  assert.ok(r.orderByInDays <= 0);
});

test("agotado tiene la urgencia máxima", () => {
  const r = computeReorder(prod({ stock: 0, velocityPerMonth: 30 }));
  assert.equal(r.urgency, "agotado");
});

test("cantidad sugerida lleva el stock al objetivo (lead + cobertura meta)", () => {
  // 30/mes = 1/día; lead 30 + targetCover 30 = 60 objetivo; stock 10 → sugiere 50.
  const r = computeReorder(prod({ stock: 10, velocityPerMonth: 30, leadDays: 30 }));
  const objetivo = (30 / 30) * (30 + RESTOCK_PARAMS.targetCoverDays);
  assert.equal(r.suggestedQty, Math.ceil(objetivo - 10));
});

test("lead time nulo usa el default del modelo", () => {
  const r = computeReorder(prod({ leadDays: null }));
  assert.equal(r.leadDays, RESTOCK_PARAMS.defaultLeadDays);
});

test("buildRestockSuggestions ordena por urgencia y filtra los OK", () => {
  const res = buildRestockSuggestions([
    prod({ product_id: "ok", stock: 1000, velocityPerMonth: 10 }),
    prod({ product_id: "agotado", stock: 0, velocityPerMonth: 30 }),
    prod({ product_id: "pronto", stock: 40, velocityPerMonth: 30, leadDays: 30 }),
  ]);
  assert.ok(!res.find((r) => r.product_id === "ok")); // los OK se excluyen
  assert.equal(res[0].product_id, "agotado"); // urgencia máxima primero
});
