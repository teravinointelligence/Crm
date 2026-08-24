import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCrmAccountId,
  selectTomasGroupsForRep,
} from "../lib/tomas-inventario-popup.ts";

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

const accounts = [
  { id: "a245", business_name: "Hotel San Cristóbal", client_number: "245" },
  { id: "a99", business_name: "Casa Dorada", client_number: "00099" },
];

test("cruza el cliente de Base44 con la cuenta CRM por número de cliente", () => {
  assert.equal(
    resolveCrmAccountId({ cliente: "Nombre distinto", clienteNumero: "000245" }, accounts),
    "a245",
  );
});

test("usa el nombre normalizado solo como respaldo único", () => {
  assert.equal(
    resolveCrmAccountId({ cliente: "HOTEL SAN CRISTOBAL", clienteNumero: null }, accounts),
    "a245",
  );
  assert.equal(
    resolveCrmAccountId(
      { cliente: "Casa Dorada", clienteNumero: null },
      [...accounts, { id: "duplicada", business_name: "Casa Dorada", client_number: null }],
    ),
    null,
  );
});
