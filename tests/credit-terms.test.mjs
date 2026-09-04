import { test } from "node:test";
import assert from "node:assert/strict";
import { creditDaysLabel, nextCreditDays } from "../lib/credit-terms.ts";

test("reduce el crédito al siguiente peldaño estándar", () => {
  const cases = new Map([
    [90, 60],
    [60, 45],
    [45, 30],
    [30, 15],
    [28, 15],
    [27, 15],
    [15, 0],
    [7, 0],
    [0, 0],
  ]);

  for (const [current, expected] of cases) {
    assert.equal(nextCreditDays(current), expected, `${current} -> ${expected}`);
  }
});

test("conserva plazo indefinido y etiqueta contado", () => {
  assert.equal(nextCreditDays(null), null);
  assert.equal(nextCreditDays(undefined), null);
  assert.equal(creditDaysLabel(0), "Contado");
  assert.equal(creditDaysLabel(45), "45 días");
});
