// Deducción del almacén desde el nombre del archivo de CONTPAQ. npm test
//
// Los nombres son los reales de la carpeta de Drive (My Mac/Downloads): el
// escenario de Make se apoya en esto para saber a qué bodega va cada .xls.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  warehouseFromFilename,
  looksLikeInventarioFile,
} from "../lib/inventario/warehouse-from-filename.ts";

test("nombres reales de Drive se mapean a su bodega", () => {
  const casos = [
    ["inventario v612 3 agosto.xls", "V612"],
    ["inventario almacen v612 6 agosto.xls", "V612"],
    ["inventario v612 22 jul.xls", "V612"],
    ["inventario la paz 3 agosto.xls", "La Paz"],
    ["inventario bodega lap 5 ago.xls", "La Paz"],
    ["inventario tijuana 7 agosto.xls", "Tijuana"],
    ["inventario almacen tijuana 27 jul.xls", "Tijuana"],
    ["inventario vallarta 7 agosto.xls", "Vallarta"],
    ["inventario vallarta 3 julio.xls", "Vallarta"],
    ["inventario los cabos 6 agosto.xls", "Los Cabos"],
    ["inventario los cabos al 28 marzo.xls", "Los Cabos"],
    ["Inventario actual del almacen cabo 23.xls", "Los Cabos"],
    ["INVENTARIO LOS CABOS 23 OCT.xls", "Los Cabos"],
  ];
  for (const [name, esperado] of casos) {
    assert.equal(warehouseFromFilename(name), esperado, name);
  }
});

test("archivos que no son de un almacén se ignoran", () => {
  for (const name of [
    "inventario Nemi al 28 mayo.xls", // toma de un cliente en consignación
    "Inventario con precios consignacion Yeo Mayo 2026.xls",
    "inventario Teravino 26 marzo.xlsx",
    "Inventario actual del almacen 19 nov 2023.xls", // sin bodega en el nombre
    "Reporte_Ventas_Julio_2026.xls",
    "",
  ]) {
    assert.equal(warehouseFromFilename(name), null, name);
  }
});

test("un nombre con dos bodegas es ambiguo, no se adivina", () => {
  assert.equal(warehouseFromFilename("inventario tijuana y vallarta 7 agosto.xls"), null);
  assert.equal(warehouseFromFilename("inventario la paz los cabos.xls"), null);
});

test("los alias cortos no empatan dentro de otra palabra", () => {
  // "lap" vive dentro de "vallarta"… no, pero sí dentro de otras palabras;
  // el match es por palabra completa.
  assert.equal(warehouseFromFilename("inventario colapso 3 agosto.xls"), null);
  assert.equal(warehouseFromFilename("inventario cabotaje 3 agosto.xls"), null);
  assert.equal(warehouseFromFilename("inventario tjuana.xls"), null);
});

test("looksLikeInventarioFile filtra la carpeta de Drive", () => {
  assert.equal(looksLikeInventarioFile("inventario tijuana 7 agosto.xls"), true);
  assert.equal(looksLikeInventarioFile("inventario los cabos 6 agosto.xls"), true);
  // sin la palabra "inventario"
  assert.equal(looksLikeInventarioFile("existencias tijuana 7 agosto.xls"), false);
  // no es hoja de cálculo
  assert.equal(looksLikeInventarioFile("inventario tijuana 7 agosto.pdf"), false);
  // no es de un almacén
  assert.equal(looksLikeInventarioFile("inventario Nemi al 28 mayo.xls"), false);
});
