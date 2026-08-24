import { test } from "node:test";
import assert from "node:assert/strict";
import { selectTomasGroupsForRep } from "../lib/tomas-inventario-popup.ts";

const groups = [
  {
    vendedorId: "yamile",
    vendedorNombre: "Yamile",
    email: "yamile@teravino.com",
    activo: true,
    items: [{ consignacionId: "c1", cliente: "Casa Dorada" }],
  },
  {
    vendedorId: "felix",
    vendedorNombre: "Félix",
    email: "felix@teravino.com",
    activo: true,
    items: [{ consignacionId: "c2", cliente: "Yeo Punto Novo" }],
  },
];

test("un vendedor solo recibe sus propias tomas pendientes", () => {
  const selected = selectTomasGroupsForRep(groups, " YAMILE@teravino.com ", false);
  assert.deepEqual(selected.map((group) => group.vendedorId), ["yamile"]);
});

test("un usuario sin correspondencia no recibe datos del equipo", () => {
  assert.deepEqual(selectTomasGroupsForRep(groups, "otro@teravino.com", false), []);
  assert.deepEqual(selectTomasGroupsForRep(groups, null, false), []);
});

test("el administrador conserva el panorama completo", () => {
  assert.equal(selectTomasGroupsForRep(groups, "sabrina@teravino.com", true).length, 2);
});
