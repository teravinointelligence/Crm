// Clasificación de categorías para el tope de muestras (vino vs cerveza). npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleBucket, SAMPLE_CAP } from "../lib/samples.ts";

test("cerveza cuenta como cerveza", () => {
  assert.equal(sampleBucket("cerveza"), "cerveza");
});

test("todo lo demás cuenta como vino", () => {
  for (const c of ["vino_tinto", "vino_blanco", "vino_rosado", "vino_naranja", "espumoso", "destilado", "sake", "otro"]) {
    assert.equal(sampleBucket(c), "vino", `${c} debería ser vino`);
  }
});

test("sin categoría (null/undefined/vacío) cuenta como vino (renglón manual)", () => {
  assert.equal(sampleBucket(null), "vino");
  assert.equal(sampleBucket(undefined), "vino");
  assert.equal(sampleBucket(""), "vino");
});

test("el tope por categoría sigue siendo 6 / 30 días", () => {
  assert.equal(SAMPLE_CAP.botellasPorCliente, 6);
  assert.equal(SAMPLE_CAP.ventanaDias, 30);
});
