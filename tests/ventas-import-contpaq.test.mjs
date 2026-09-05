// Pruebas del parser del "Reporte de Ventas por Cliente" (CONTPAQ): Total
// General para el cuadre y payload del import. npm test
//
// parseVentas.ts importa "./parseCartera" sin extensión; registramos un hook
// de resolución antes de importarlo.

import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

register("./helpers/ts-resolve-hook.mjs", import.meta.url);
const { parseVentasContpaq, sumClientes } = await import("../lib/excel/parseVentas.ts");
const { buildClientesPayload } = await import("../lib/ventas/import-contpaq.ts");

// Layout mínimo del reporte crudo (encabezado, dos clientes, Total General).
function reportBuffer(rows) {
  const aoa = [
    ["CONTPAQ i", "", "", "", "TERAVINO"],
    ["Moneda: Peso Mexicano", "", "", "", "Reporte de Ventas por Cliente", "", "", "", "04/SEP/2026"],
    ["", "", "", "", "Del 01/SEP/2026 al 30/SEP/2026"],
    [],
    ["Código", "Nombre (Producto,Servicio,Paquete)", "Cantidad", "Unidad", "Neto", "Descuento", "Neto-Desc.", "Impuesto", "Total"],
    ...rows,
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Reporte de Ventas");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out instanceof ArrayBuffer ? out : out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

const ROWS = [
  ["Cliente:", "507"],
  ["Nombre:", "JANETH FABIOLA DE ANDA SANJUAN"],
  ["324UVBLANC", "VINALTURA SAUVIGNON BLANCO SECO 12/750 ML", 2, "", 860, 0, 860, 137.6, 997.6],
  [],
  ["", "Total Cliente", 2, "", 860, 0, 860, 137.6, 997.6],
  ["Cliente:", "499"],
  ["Nombre:", "MUESTRAS FELIX"],
  ["132ILFARCA", "IL FAUNO DI ARCANUM 06/750 ML", 1, "", 0.01, 0, 0.01, 0, 0.01],
  [],
  ["", "Total Cliente", 1, "", 0.01, 0, 0.01, 0, 0.01],
  ["", "===========", "", "==========="],
  ["", "Total General", 3, "", 860.01, 0, 860.01, 137.6, 997.61],
];

test("lee el Total General del reporte y detecta el periodo", async () => {
  const res = await parseVentasContpaq(reportBuffer(ROWS));
  assert.equal(res.periodGuess, "2026-09-01");
  assert.equal(res.clientes.length, 2);
  assert.deepEqual(res.totalGeneral, { cantidad: 3, neto: 860.01, descuento: 0, neto_desc: 860.01, impuesto: 137.6, total: 997.61 });
  // Lo parseado cuadra con el Total General (mismo redondeo a centavos).
  assert.deepEqual(sumClientes(res.clientes), res.totalGeneral);
});

test("totalGeneral es null si el archivo no trae la fila", async () => {
  const res = await parseVentasContpaq(reportBuffer(ROWS.slice(0, -2)));
  assert.equal(res.totalGeneral, null);
  assert.equal(res.clientes.length, 2);
});

test("el payload del RPC conserva # de cliente, nombre y partidas", async () => {
  const res = await parseVentasContpaq(reportBuffer(ROWS));
  const payload = buildClientesPayload(res.clientes);
  assert.equal(payload[0].client_number, "507");
  assert.equal(payload[0].client_name, "JANETH FABIOLA DE ANDA SANJUAN");
  assert.equal(payload[0].venta_bruta, 997.6);
  assert.deepEqual(payload[0].items[0], {
    codigo: "324UVBLANC", producto_nombre: "VINALTURA SAUVIGNON BLANCO SECO 12/750 ML",
    cantidad: 2, neto: 860, descuento: 0, neto_desc: 860, impuesto: 137.6, total: 997.6,
  });
  assert.equal(payload[1].client_name, "MUESTRAS FELIX");
});
