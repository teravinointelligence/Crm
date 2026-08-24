import test from "node:test";
import assert from "node:assert/strict";
import { classifyRestock, inventoryAgeDays } from "../lib/restock-review-rules.ts";

test("marca como no recomendado cuando no hay ventas recientes", () => {
  assert.equal(classifyRestock({ requested: 12, salesPerMonth: 0, suggestedQty: 12 }).verdict, "no_recomendado");
});

test("sugiere reducir cuando el pedido supera la necesidad", () => {
  assert.equal(classifyRestock({ requested: 24, salesPerMonth: 12, suggestedQty: 8 }).verdict, "reducir");
});

test("justifica un pedido dentro de la cantidad sugerida", () => {
  assert.equal(classifyRestock({ requested: 6, salesPerMonth: 12, suggestedQty: 8 }).verdict, "justificado");
});

test("calcula la antiguedad del inventario en dias", () => {
  assert.equal(inventoryAgeDays("2026-08-16", new Date("2026-08-24T12:00:00Z")), 8);
});
