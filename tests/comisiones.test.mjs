// Pruebas del cálculo de comisiones estimadas. npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clasificaLinea,
  baseSinImpuestos,
  comisionDeLineas,
  profileKeyFromName,
} from "../lib/comisiones.ts";

const round = (n) => Math.round(n * 100) / 100;

test("base quita IEPS e IVA desde el total con impuestos", () => {
  // 1000 / 1.265 / 1.16 = 681.48
  assert.equal(round(baseSinImpuestos(1000)), 681.48);
});

test("clasificación: código con CER es cerveza", () => {
  assert.equal(clasificaLinea("CER123", "Lo que sea"), "cerveza");
});

test("clasificación: excepciones de código son vino", () => {
  for (const cod of ["553LEACER", "262ECRUCER", "LEXCEROSE", "ALSACERIES"]) {
    assert.equal(clasificaLinea(cod, "x"), "vino");
  }
});

test("clasificación: nombre con SIN ALCOHOL es vino aunque el código diga CER", () => {
  assert.equal(clasificaLinea("CER999", "Cerveza SIN ALCOHOL Lager"), "vino");
});

test("Emmanuel: todo es vino aunque el código sea cerveza", () => {
  const r = comisionDeLineas(
    [{ codigo: "CER123", nombre: "Cerveza X", total: 1.265 * 1.16, descuento: 0, clientNumber: "100" }],
    "emmanuel",
  );
  // base = 1, vino 10%
  assert.equal(r.ventaCerveza, 0);
  assert.equal(round(r.ventaVino), round(1.265 * 1.16));
  assert.equal(round(r.comTotal), 0.1);
});

test("Emmanuel no comisiona cerveza pero como todo es vino, sí comisiona 10%", () => {
  const r = comisionDeLineas(
    [{ codigo: "CERVEZ1", nombre: "Barril X", total: 100, descuento: 0, clientNumber: "1" }],
    "emmanuel",
  );
  assert.ok(r.comTotal > 0);
});

test("Yamile: vino y cerveza al 3%", () => {
  const total = 1.265 * 1.16; // base 1
  const r = comisionDeLineas(
    [
      { codigo: "VINO1", nombre: "Tinto", total, descuento: 0, clientNumber: "1" },
      { codigo: "CER1", nombre: "Cerveza", total, descuento: 0, clientNumber: "1" },
    ],
    "yamile",
  );
  assert.equal(round(r.comVino), 0.03);
  assert.equal(round(r.comCerveza), 0.03);
});

test("Citlali: exclusión permanente de #347 y #353", () => {
  const total = 1.265 * 1.16;
  const r = comisionDeLineas(
    [
      { codigo: "VINO1", nombre: "Tinto", total, descuento: 0, clientNumber: "353" },
      { codigo: "VINO1", nombre: "Tinto", total, descuento: 0, clientNumber: "347" },
      { codigo: "VINO1", nombre: "Tinto", total, descuento: 0, clientNumber: "999" },
    ],
    "citlali",
  );
  assert.equal(r.lineasContadas, 1);
  assert.equal(r.lineasExcluidas, 2);
});

test("Yamile #406: incluir si descuento 0, excluir si descuento > 0", () => {
  const total = 1.265 * 1.16;
  const r = comisionDeLineas(
    [
      { codigo: "VINO1", nombre: "Tinto", total, descuento: 0, clientNumber: "406" },
      { codigo: "VINO1", nombre: "Tinto", total, descuento: 50, clientNumber: "406" },
    ],
    "yamile",
  );
  assert.equal(r.lineasContadas, 1);
  assert.equal(r.lineasExcluidas, 1);
});

test("Sabrina: 4% sobre todo, sin exclusiones (cuenta #353 y #406 con descuento)", () => {
  const total = 1.265 * 1.16; // base 1 por línea
  const r = comisionDeLineas(
    [
      { codigo: "VINO1", nombre: "Tinto", total, descuento: 0, clientNumber: "353" },
      { codigo: "CER1", nombre: "Cerveza", total, descuento: 99, clientNumber: "406" },
    ],
    "sabrina",
  );
  assert.equal(r.lineasContadas, 2);
  assert.equal(r.lineasExcluidas, 0);
  assert.equal(round(r.comTotal), 0.08); // 2 bases * 4%
});

test("profileKeyFromName mapea por primer nombre, ignora acentos", () => {
  assert.equal(profileKeyFromName("Sabrina Sánchez"), "sabrina");
  assert.equal(profileKeyFromName("Citlali Aguilar"), "citlali");
  assert.equal(profileKeyFromName("Andra Verea"), "andra");
  assert.equal(profileKeyFromName("Desconocido Pérez"), null);
});
