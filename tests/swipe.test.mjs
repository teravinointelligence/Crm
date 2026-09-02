// Pruebas de la decisión de eje del gesto deslizable. npm test
//
// El caso que motivó esto: en celular, tocar el nombre del cliente dentro de
// una tarjeta deslizable no abría su ficha. El toque movía el dedo lo justo
// para que el gesto se activara, la tarjeta capturaba el puntero y el clic del
// enlace nunca llegaba.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE_PX, decideAxis } from "../lib/swipe.ts";

test("un toque no activa el gesto aunque el dedo se mueva un poco", () => {
  // Lo que de verdad pasa al tocar un enlace con el pulgar.
  for (const [dx, dy] of [
    [0, 0],
    [3, 2],
    [6, 1],
    [8, 4],
    [10, 6],
    [-9, 3],
  ]) {
    assert.equal(
      decideAxis(dx, dy),
      null,
      `un desplazamiento de (${dx},${dy}) debe seguir siendo un toque`,
    );
  }
});

test("un deslizamiento claro sí activa el gesto", () => {
  assert.equal(decideAxis(40, 3), "h");
  assert.equal(decideAxis(-40, 3), "h");
  assert.equal(decideAxis(120, 20), "h");
});

test("el scroll vertical gana: la lista tiene que seguir desplazándose", () => {
  assert.equal(decideAxis(2, 40), "v");
  assert.equal(decideAxis(0, -60), "v");
});

test("ante la duda gana el scroll, no el deslizamiento", () => {
  // Diagonal: horizontal apenas empata con vertical → no debe deslizar.
  assert.equal(decideAxis(30, 28), "v");
  assert.equal(decideAxis(30, 25), "v");
  // Ya con dominio claro sí desliza.
  assert.equal(decideAxis(30, 10), "h");
});

test("el umbral es más grande que la deriva típica de un pulgar", () => {
  assert.ok(ACTIVATE_PX >= 12, "por debajo de 12px los toques se tragan el clic");
});
