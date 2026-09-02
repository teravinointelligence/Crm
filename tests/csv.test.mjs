// Pruebas del armado de CSV para los reportes descargables. npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../lib/csv.ts";

test("usa punto y coma (Excel es-MX) y CRLF entre renglones", () => {
  const csv = toCsv([
    ["Vendedor", "Botellas"],
    ["Citlali", 6],
  ]);
  assert.equal(csv, "Vendedor;Botellas\r\nCitlali;6");
});

test("entrecomilla lo que trae separadores, comillas o saltos de línea", () => {
  const csv = toCsv([["Vinos, S.A.", 'Le dicen "El Güero"', "linea1\nlinea2"]]);
  assert.equal(csv, '"Vinos, S.A.";"Le dicen ""El Güero""";"linea1\nlinea2"');
});

test("null y undefined salen como celda vacía", () => {
  assert.equal(toCsv([[null, undefined, 0]]), ";;0");
});
