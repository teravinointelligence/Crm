// Pruebas del emparejador "proveedor por producto". npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProveedorRows } from "../lib/proveedor-map.ts";

const products = [
  { id: "p1", sku: "TAPIZ-MALBEC-750", name: "Tapiz Black Tears Malbec", codigo_contpaqi: "C-100", supplier: "Tapiz" },
  { id: "p2", sku: "GOMEZ-CRIANZA-750", name: "Gómez Cruzado Crianza", codigo_contpaqi: "C-200", supplier: "Gómez" },
  { id: "p3", sku: "ZERO-SB-750", name: "Zero by Terres Fumées, SB 0%", codigo_contpaqi: null, supplier: "Zero" },
];

test("match exacto por SKU y marca cambio de proveedor", () => {
  const [m] = matchProveedorRows({
    products,
    rows: [{ proveedor: "Bodega Tapiz", sku: "TAPIZ-MALBEC-750", codigo: null, nombre: null }],
  });
  assert.equal(m.product_id, "p1");
  assert.equal(m.via, "sku");
  assert.equal(m.score, 1);
  assert.equal(m.changes, true); // "Tapiz" -> "Bodega Tapiz"
});

test("match exacto por código CONTPAQ", () => {
  const [m] = matchProveedorRows({
    products,
    rows: [{ proveedor: "Gómez Cruzado", sku: null, codigo: "C-200", nombre: null }],
  });
  assert.equal(m.product_id, "p2");
  assert.equal(m.via, "codigo");
});

test("match exacto por nombre normalizado", () => {
  const [m] = matchProveedorRows({
    products,
    rows: [{ proveedor: "Terres Fumées", sku: null, codigo: null, nombre: "Zero by Terres Fumées SB 0%" }],
  });
  assert.equal(m.product_id, "p3");
  assert.equal(m.via, "nombre");
  assert.equal(m.proveedor, "Terres Fumées");
});

test("sin cambio cuando el proveedor es igual al actual", () => {
  const [m] = matchProveedorRows({
    products,
    rows: [{ proveedor: "Tapiz", sku: "TAPIZ-MALBEC-750", codigo: null, nombre: null }],
  });
  assert.equal(m.changes, false);
});

test("sin match cuando no hay identificador que cruce", () => {
  const [m] = matchProveedorRows({
    products,
    rows: [{ proveedor: "X", sku: "NO-EXISTE", codigo: null, nombre: "Producto inexistente zzz" }],
  });
  assert.equal(m.product_id, null);
  assert.equal(m.via, "none");
});
