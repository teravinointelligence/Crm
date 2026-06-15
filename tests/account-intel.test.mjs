// Pruebas de churn y cross-sell (puros). npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChurn } from "../lib/churn.ts";
import { recommendForAccount } from "../lib/cross-sell.ts";

const PERIODS = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"];
const ms = (amounts) => PERIODS.map((p, i) => ({ period: p, amount: amounts[i] })).filter((x) => x.amount != null);

test("churn: caída fuerte vs propio patrón", () => {
  // baseline ~110k, último mes 25k → -77%
  const r = computeChurn(ms([168000, 146000, 89000, 111000, 25000]), PERIODS);
  assert.equal(r.status, "cayo");
  assert.ok(r.dropPct > 0.5);
});

test("churn: dejó de facturar (último mes 0)", () => {
  const r = computeChurn(ms([50000, 60000, 55000, 58000, 0]), PERIODS);
  assert.equal(r.status, "sin_facturacion");
});

test("churn: compra estable", () => {
  const r = computeChurn(ms([50000, 52000, 48000, 51000, 50000]), PERIODS);
  assert.equal(r.status, "sano");
});

test("churn: historia insuficiente no se evalúa", () => {
  const r = computeChurn(ms([null, null, null, null, 40000]), PERIODS);
  assert.equal(r.status, "sin_historial");
});

test("cross-sell: recomienda lo que compran clientes parecidos y este no", () => {
  const baskets = [
    { account_id: "target", account_type: "restaurante", region: "La Paz", codigos: new Set(["A", "B"]) },
    { account_id: "s1", account_type: "restaurante", region: "La Paz", codigos: new Set(["A", "B", "C"]) },
    { account_id: "s2", account_type: "restaurante", region: "La Paz", codigos: new Set(["A", "B", "C", "D"]) },
    { account_id: "otro", account_type: "bar", region: "Tijuana", codigos: new Set(["A", "B", "Z"]) },
  ];
  const nombres = new Map([["C", "Catena Malbec"], ["D", "Veuve Clicquot"], ["Z", "Cerveza"]]);
  const recos = recommendForAccount("target", baskets, nombres, { minShared: 2, topN: 5, minSupporters: 1 });
  const codigos = recos.map((r) => r.codigo);
  assert.deepEqual(codigos.slice(0, 2), ["C", "D"]); // C lo compran 2 parecidos, D solo 1
  assert.ok(!codigos.includes("Z")); // "otro" es de otro giro/región → no cuenta
  assert.match(recos[0].reason, /clientes parecidos/);
});

test("cross-sell: sin clientes parecidos devuelve vacío", () => {
  const baskets = [
    { account_id: "target", account_type: "hotel", region: "Nayarit", codigos: new Set(["X"]) },
    { account_id: "s1", account_type: "bar", region: "Tijuana", codigos: new Set(["X", "Y"]) },
  ];
  const recos = recommendForAccount("target", baskets, new Map(), { minShared: 2, topN: 5, minSupporters: 1 });
  assert.equal(recos.length, 0);
});
