import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePersonalActionBonus,
  calculatePersonalCollectionBonus,
  calculatePersonalSalesBonus,
  getPersonalIncentiveConfig,
  listPersonalIncentivePeriods,
  listPersonalSalesHistoryPeriods,
  personalIncentiveStatus,
} from "../lib/personal-incentives.ts";
import {
  calculateSeasonalSalesTarget,
  roundSalesTarget,
} from "../lib/sales-targets.ts";

test("solo configura a los cinco vendedores aprobados", () => {
  assert.equal(getPersonalIncentiveConfig(" FELIX@TERAVINO.COM ")?.key, "felix");
  assert.equal(getPersonalIncentiveConfig("citlali@teravino.com")?.key, "citlali");
  assert.equal(getPersonalIncentiveConfig("yamile@teravino.com")?.key, "yamile");
  assert.equal(getPersonalIncentiveConfig("andra@teravino.com")?.key, "andra");
  assert.equal(getPersonalIncentiveConfig("emmanuel@teravino.com")?.key, "emmanuel");
  assert.equal(getPersonalIncentiveConfig("saulo@teravino.com"), null);
});

test("el bono de ventas se desbloquea en 100, 110 y 120 por ciento", () => {
  const below = calculatePersonalSalesBonus(99_999, 100_000);
  assert.equal(below.rate, 0);
  assert.equal(below.bonus, 0);
  assert.equal(Math.round(below.progress * 1_000) / 1_000, 99.999);
  assert.deepEqual(calculatePersonalSalesBonus(100_000, 100_000), {
    rate: 0.005,
    bonus: 500,
    progress: 100,
  });
  assert.deepEqual(calculatePersonalSalesBonus(110_000, 100_000), {
    rate: 0.0075,
    bonus: 825,
    progress: 110,
  });
  assert.deepEqual(calculatePersonalSalesBonus(120_000, 100_000), {
    rate: 0.01,
    bonus: 1_200,
    progress: 120,
  });
});

test("apertura y reactivación pagadas suman hasta tres mil pesos", () => {
  assert.deepEqual(
    calculatePersonalActionBonus({ paidOpenings: 1, paidReactivations: 1, enabled: true }),
    { openingBonus: 1_500, reactivationBonus: 1_500, total: 3_000 },
  );
  assert.deepEqual(
    calculatePersonalActionBonus({ paidOpenings: 2, paidReactivations: 0, enabled: true }),
    { openingBonus: 1_500, reactivationBonus: 0, total: 1_500 },
  );
  assert.equal(
    calculatePersonalActionBonus({ paidOpenings: 1, paidReactivations: 1, enabled: false }).total,
    0,
  );
});

test("cobranza paga por avance y suma mil al liberar una suspendida", () => {
  assert.deepEqual(
    calculatePersonalCollectionBonus({ collected: 49_999, goal: 100_000, releasedAccounts: 0 }),
    { progress: 49.999, tierBonus: 0, releaseBonus: 0, total: 0 },
  );
  assert.deepEqual(
    calculatePersonalCollectionBonus({ collected: 75_000, goal: 100_000, releasedAccounts: 0 }),
    { progress: 75, tierBonus: 1_500, releaseBonus: 0, total: 1_500 },
  );
  assert.deepEqual(
    calculatePersonalCollectionBonus({ collected: 100_000, goal: 100_000, releasedAccounts: 1 }),
    { progress: 100, tierBonus: 2_000, releaseBonus: 1_000, total: 3_000 },
  );
});

test("el piloto corre de septiembre a noviembre de 2026", () => {
  assert.equal(personalIncentiveStatus("2026-08-23"), "upcoming");
  assert.equal(personalIncentiveStatus("2026-09-01"), "active");
  assert.equal(personalIncentiveStatus("2026-11-30"), "active");
  assert.equal(personalIncentiveStatus("2026-12-01"), "ended");
  assert.deepEqual(listPersonalIncentivePeriods("2026-11-01"), [
    "2026-09-01",
    "2026-10-01",
    "2026-11-01",
  ]);
});

test("dirección compara el historial 2026 con las metas del piloto", () => {
  assert.deepEqual(listPersonalSalesHistoryPeriods(), [
    "2026-01-01",
    "2026-02-01",
    "2026-03-01",
    "2026-04-01",
    "2026-05-01",
    "2026-06-01",
    "2026-07-01",
    "2026-08-01",
    "2026-09-01",
    "2026-10-01",
    "2026-11-01",
  ]);
  assert.equal(getPersonalIncentiveConfig("andra@teravino.com")?.salesTargets["2026-10-01"], 725_000);
  assert.equal(getPersonalIncentiveConfig("citlali@teravino.com")?.salesTargets["2026-11-01"], 525_000);
  assert.equal(getPersonalIncentiveConfig("yamile@teravino.com")?.salesTargets["2026-09-01"], 550_000);
  assert.equal(getPersonalIncentiveConfig("emmanuel@teravino.com")?.salesTargets["2026-09-01"], 275_000);
});

test("la meta dinámica toma el mayor escenario y redondea hacia arriba a 25 mil", () => {
  assert.equal(roundSalesTarget(500_001), 525_000);
  const target = calculateSeasonalSalesTarget({
    minimumFloor: 325_000,
    recentClosedSales: [212_600.39, 183_923.48, 284_839.07],
    priorYearSales: 221_562.92,
    currentYtdSales: 1_888_226.17,
    priorYtdSales: 877_779.73,
  });
  assert.equal(target.target, 550_000);
  assert.equal(target.selectedBasis, "seasonality");
  assert.equal(Math.round(target.recentAverage), 227_121);
  assert.equal(Math.round(target.ytdFactor * 10_000) / 10_000, 2.1511);
});

test("el mínimo protege la temporada baja y el promedio reciente conserva el reto de 15%", () => {
  const lowSeason = calculateSeasonalSalesTarget({
    minimumFloor: 550_000,
    recentClosedSales: [439_491.67, 522_864.46, 365_673.10],
    priorYearSales: 262_860.42,
    currentYtdSales: 5_056_364.16,
    priorYtdSales: 4_681_960.08,
  });
  assert.equal(lowSeason.target, 550_000);
  assert.equal(lowSeason.selectedBasis, "floor");

  const recent = calculateSeasonalSalesTarget({
    minimumFloor: 260_000,
    recentClosedSales: [186_855.81, 270_979.06, 229_981.98],
    priorYearSales: 41_710.09,
    currentYtdSales: 1_020_158.07,
    priorYtdSales: 603_050.63,
  });
  assert.equal(recent.target, 275_000);
  assert.equal(recent.selectedBasis, "recent_average");
});
