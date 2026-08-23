import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFelixIncentiveSnapshot,
  calculateFelixAccelerator,
  calculateOpeningBonus,
  isFelixIncentiveUser,
} from "../lib/felix-incentive.ts";

const opening = (id, repeatPurchaseDate = null) => ({
  accountId: id,
  accountName: `Cuenta ${id}`,
  firstPurchaseDate: "2026-09-05",
  repeatPurchaseDate,
});

test("el incentivo solo identifica el correo autenticado de Félix", () => {
  assert.equal(isFelixIncentiveUser("felix@teravino.com"), true);
  assert.equal(isFelixIncentiveUser(" FELIX@TERAVINO.COM "), true);
  assert.equal(isFelixIncentiveUser("sabrina@teravino.com"), false);
  assert.equal(isFelixIncentiveUser(null), false);
});

test("el acelerador aplica porcentajes progresivos por tramo", () => {
  assert.equal(calculateFelixAccelerator(350_000), 0);
  assert.equal(calculateFelixAccelerator(400_000), 500);
  assert.equal(calculateFelixAccelerator(500_000), 2_500);
  assert.equal(calculateFelixAccelerator(600_000), 5_500);
});

test("las aperturas se topan en dos cuentas y se liberan desde 400 mil", () => {
  const openings = [
    opening("a", "2026-09-20"),
    opening("b", "2026-09-25"),
    opening("c", "2026-09-29"),
  ];
  assert.deepEqual(calculateOpeningBonus(399_999, openings), {
    milestones: 4,
    potential: 4_000,
    unlocked: 0,
  });
  assert.deepEqual(calculateOpeningBonus(400_000, openings), {
    milestones: 4,
    potential: 4_000,
    unlocked: 4_000,
  });
});

test("antes de iniciar muestra septiembre y la cuenta regresiva", () => {
  const snapshot = buildFelixIncentiveSnapshot({ todayKey: "2026-08-23" });
  assert.equal(snapshot.status, "upcoming");
  assert.equal(snapshot.currentPeriod, "2026-09-01");
  assert.equal(snapshot.daysUntilStart, 9);
  assert.equal(snapshot.current.netSales, 0);
});

test("el total variable suma comisión ordinaria, acelerador y aperturas", () => {
  const snapshot = buildFelixIncentiveSnapshot({
    todayKey: "2026-09-30",
    salesByPeriod: { "2026-09-01": 500_000 },
    openingsByPeriod: {
      "2026-09-01": [opening("a", "2026-09-22"), opening("b")],
    },
  });
  assert.equal(snapshot.status, "active");
  assert.equal(snapshot.current.ordinaryCommission, 15_000);
  assert.equal(snapshot.current.accelerator, 2_500);
  assert.equal(snapshot.current.openingBonus, 3_000);
  assert.equal(snapshot.current.totalVariable, 20_500);
});
