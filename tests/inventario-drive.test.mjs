// Pruebas del puente Drive → inventario por almacén. npm test
//
// Los nombres de archivo usados aquí son los reales de la carpeta de Drive,
// con todo y su inconsistencia ("bodega lap" vs "almacen v612" vs "los cabos").

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  warehouseFromFileName,
  isInventoryFile,
  pickLatestPerWarehouse,
} from "../lib/inventario-drive.ts";

const file = (name, modifiedTime) => ({ id: name, name, modifiedTime });

test("reconoce el almacén en los nombres reales de Drive", () => {
  const casos = [
    ["inventario v612 5 agosto.xls", "V612"],
    ["inventario almacen v612 6 agosto.xls", "V612"],
    ["inventario tijuana 7 agosto.xls", "Tijuana"],
    ["inventario vallarta 7 agosto.xls", "Vallarta"],
    ["inventario los cabos 6 agosto.xls", "Los Cabos"],
    ["inventario bodega lap 5 ago.xls", "La Paz"],
  ];
  for (const [name, esperado] of casos) {
    assert.equal(warehouseFromFileName(name).warehouse, esperado, name);
  }
});

test("tolera acentos y mayúsculas", () => {
  assert.equal(
    warehouseFromFileName("Inventario Almacén La Paz 08AGO2026.xlsx").warehouse,
    "La Paz",
  );
});

test("no confunde 'cab' dentro de 'cabos' ni empata subcadenas sueltas", () => {
  // "cabos" es alias de Los Cabos; "cab" también. Ninguno debe empatar dentro
  // de otra palabra que apenas los contenga.
  assert.equal(warehouseFromFileName("inventario cabaña 1 agosto.xls").warehouse, null);
});

test("omite el archivo si el nombre menciona dos almacenes", () => {
  const r = warehouseFromFileName("Traspaso_Vallarta_Tijuana_07ago2026.xlsx");
  assert.equal(r.warehouse, null);
  assert.match(r.reason, /varios almacenes/);
});

test("filtra lo que no es un corte de inventario", () => {
  assert.equal(isInventoryFile("inventario tijuana 7 agosto.xls"), true);
  assert.equal(isInventoryFile("reporte ventas al 7 agosto cierre.xls"), false);
  assert.equal(isInventoryFile("Traspaso_LosCabos_a_LaPaz98_06ago2026.xlsx"), false);
  assert.equal(isInventoryFile("V612_Planograma_Actual.pdf"), false);
  assert.equal(isInventoryFile("~$inventario tijuana.xlsx"), false);
  assert.equal(isInventoryFile("IMG_6040.JPG"), false);
});

test("se queda con el corte más reciente de cada almacén", () => {
  const { candidates } = pickLatestPerWarehouse([
    file("inventario tijuana 5 agosto.xls", "2026-08-05T17:59:02Z"),
    file("inventario tijuana 7 agosto.xls", "2026-08-07T17:59:02Z"),
    file("inventario v612 5 agosto.xls", "2026-08-05T21:51:25Z"),
  ]);

  assert.equal(candidates.length, 2);
  const tij = candidates.find((c) => c.warehouse === "Tijuana");
  assert.equal(tij.file.name, "inventario tijuana 7 agosto.xls");
});

test("reporta lo omitido en vez de tragárselo", () => {
  const { candidates, skipped } = pickLatestPerWarehouse([
    file("inventario del almacen general.xls", "2026-08-07T00:00:00Z"),
    file("reporte ventas al 7 agosto cierre.xls", "2026-08-07T00:00:00Z"),
  ]);

  assert.equal(candidates.length, 0);
  // El reporte de ventas ni siquiera es candidato; el inventario sin almacén
  // reconocible sí se reporta para que alguien lo note.
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /No reconocí el almacén/);
});
