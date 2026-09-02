import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductPurchaseTimeline } from "../lib/product-purchase-timeline.ts";

const periods = (...months) => months.map((month) => `2026-${String(month).padStart(2, "0")}-01`);

function timeline({
  allPeriods = periods(1, 2, 3, 4),
  detailedPeriods = allPeriods,
  purchases = [],
  currentPeriod = "2026-05-01",
  encartadoCodes = [],
} = {}) {
  const sales = allPeriods.map((period, index) => ({ id: `sale-${index + 1}`, period }));
  const saleIdByPeriod = new Map(sales.map((sale) => [sale.period, sale.id]));
  const items = purchases.map((purchase) => ({
    monthly_sale_id: saleIdByPeriod.get(purchase.period),
    codigo: Object.hasOwn(purchase, "code") ? purchase.code : "VINO-1",
    producto_nombre: purchase.name ?? "Vino de prueba",
    cantidad: purchase.units ?? 1,
    total: purchase.amount ?? 100,
  }));
  return buildProductPurchaseTimeline({
    sales,
    items,
    allPeriods,
    detailedPeriods,
    encartadoCodes,
    currentPeriod,
  });
}

test("marca como comprando al producto presente en el último mes cerrado", () => {
  const result = timeline({ purchases: [{ period: "2026-04-01" }] });
  assert.equal(result.products[0].status, "active");
  assert.equal(result.products[0].monthsSinceLastPurchase, 0);
  assert.equal(result.latestDetailedClosedPeriod, "2026-04-01");
});

test("alerta amarilla tras un mes ausente si compraba 2 de los 3 anteriores", () => {
  const result = timeline({
    allPeriods: periods(1, 2, 3),
    purchases: [{ period: "2026-01-01" }, { period: "2026-02-01" }],
    currentPeriod: "2026-04-01",
  });
  assert.equal(result.products[0].status, "watch");
  assert.equal(result.products[0].monthsSinceLastPurchase, 1);
});

test("alerta roja tras dos meses ausentes para un producto antes regular", () => {
  const result = timeline({
    purchases: [{ period: "2026-01-01" }, { period: "2026-02-01" }],
  });
  assert.equal(result.products[0].status, "stopped");
  assert.equal(result.products[0].monthsSinceLastPurchase, 2);
  assert.equal(result.products[0].lastPurchasePeriod, "2026-02-01");
});

test("una compra esporádica no produce una falsa alerta", () => {
  const allPeriods = periods(1, 2, 3, 4, 5, 6);
  const result = timeline({
    allPeriods,
    purchases: [{ period: "2026-01-01" }, { period: "2026-04-01" }],
    currentPeriod: "2026-07-01",
  });
  assert.equal(result.products[0].status, "occasional");
  assert.equal(result.products[0].monthsSinceLastPurchase, 2);
});

test("los meses sin detalle no cuentan como meses sin compra", () => {
  const result = timeline({
    allPeriods: periods(1, 2, 3),
    detailedPeriods: periods(1, 2),
    purchases: [{ period: "2026-01-01" }, { period: "2026-02-01" }],
    currentPeriod: "2026-04-01",
  });
  assert.equal(result.products[0].status, "active");
  assert.equal(result.products[0].monthsSinceLastPurchase, 0);
  assert.equal(result.periods.at(-1).detailAvailable, false);
});

test("la ausencia durante el mes en curso no genera alerta", () => {
  const result = timeline({
    allPeriods: periods(1, 2, 3),
    detailedPeriods: periods(1, 2, 3),
    purchases: [{ period: "2026-01-01" }, { period: "2026-02-01" }],
    currentPeriod: "2026-03-01",
  });
  assert.equal(result.products[0].status, "active");
  assert.equal(result.latestDetailedClosedPeriod, "2026-02-01");
  assert.equal(result.periods.at(-1).inProgress, true);
});

test("conserva productos sin código y suma partidas duplicadas del mismo mes", () => {
  const result = timeline({
    allPeriods: periods(1),
    purchases: [
      { period: "2026-01-01", code: null, name: "Vino sin código", units: 2, amount: 200 },
      { period: "2026-01-01", code: null, name: "  Vino sin código  ", units: 3, amount: 300 },
    ],
    currentPeriod: "2026-02-01",
  });
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].code, null);
  assert.equal(result.products[0].months.at(-1).units, 5);
  assert.equal(result.products[0].months.at(-1).amount, 500);
});

test("identifica un producto encartado por código sin importar mayúsculas", () => {
  const result = timeline({
    allPeriods: periods(1, 2, 3),
    purchases: [
      { period: "2026-01-01", code: "vino-1" },
      { period: "2026-02-01", code: "vino-1" },
    ],
    currentPeriod: "2026-04-01",
    encartadoCodes: ["VINO-1"],
  });
  assert.equal(result.products[0].status, "watch");
  assert.equal(result.products[0].encartado, true);
});

test("el resultado conserva una ventana consecutiva de 12 meses", () => {
  const allPeriods = ["2025-03-01", "2026-02-01"];
  const result = timeline({
    allPeriods,
    detailedPeriods: allPeriods,
    purchases: [{ period: "2026-02-01" }],
    currentPeriod: "2026-03-01",
  });
  assert.equal(result.periods.length, 12);
  assert.equal(result.periods[0].period, "2025-03-01");
  assert.equal(result.periods.at(-1).period, "2026-02-01");
});
