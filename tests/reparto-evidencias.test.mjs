// Rutas de las fotos de evidencia de entrega (puro). npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { rutaEvidencia, rutaValida, EXT_POR_TIPO } from "../lib/reparto/evidencias.ts";

const PEDIDO = "9f1c2e04-1a2b-4c3d-8e5f-6a7b8c9d0e1f";

test("rutaEvidencia genera una ruta que el validador acepta", () => {
  for (const tipo of ["image/jpeg", "image/png", "image/heic"]) {
    const path = rutaEvidencia(PEDIDO, EXT_POR_TIPO[tipo]);
    assert.ok(path.startsWith(`entregas/${PEDIDO}_`));
    assert.ok(rutaValida(PEDIDO, path), `${path} debería ser válida`);
  }
});

test("rutaValida rechaza rutas de otro pedido o fuera de entregas/", () => {
  const otro = "00000000-0000-4000-8000-000000000000";
  assert.equal(rutaValida(PEDIDO, `entregas/${otro}_1234.jpg`), false);
  assert.equal(rutaValida(PEDIDO, `otro-bucket/${PEDIDO}_1234.jpg`), false);
  assert.equal(rutaValida(PEDIDO, `entregas/../${PEDIDO}_1234.jpg`), false);
  assert.equal(rutaValida(PEDIDO, `entregas/${PEDIDO}_1234.pdf`), false);
  assert.equal(rutaValida(PEDIDO, `entregas/${PEDIDO}.jpg`), false);
});

test("rutaValida rechaza lo que no es string", () => {
  assert.equal(rutaValida(PEDIDO, null), false);
  assert.equal(rutaValida(PEDIDO, 42), false);
  assert.equal(rutaValida(PEDIDO, undefined), false);
});
