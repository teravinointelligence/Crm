import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SAMPLE_ROI_SETTINGS as settings,
  dynamicSampleLimit,
} from "../lib/sample-roi-rules.ts";

test("mantiene el límite normal mientras no hay suficiente historial", () => {
  assert.equal(dynamicSampleLimit(4, 0, 0, settings), 6);
});

test("aplica el límite crítico cuando conversión o ROI son críticos", () => {
  assert.equal(dynamicSampleLimit(5, 19.99, 10, settings), 2);
  assert.equal(dynamicSampleLimit(5, 80, 0.99, settings), 2);
});

test("aplica el límite preventivo cuando conversión o ROI están bajo objetivo", () => {
  assert.equal(dynamicSampleLimit(5, 39.99, 10, settings), 4);
  assert.equal(dynamicSampleLimit(5, 80, 2.99, settings), 4);
});

test("restaura el límite normal cuando ambos indicadores cumplen", () => {
  assert.equal(dynamicSampleLimit(5, 40, 3, settings), 6);
});
