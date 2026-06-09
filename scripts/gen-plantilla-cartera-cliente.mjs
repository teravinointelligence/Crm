import * as XLSX from "xlsx";
import { mkdirSync, writeFileSync } from "node:fs";

// Plantillas para "Cargar cartera — <cliente>" (modal POR CUENTA).
// Todas las filas se atribuyen a la cuenta abierta: NO se empareja por # cliente,
// así que las columnas # Cliente / RFC / Cliente NO hacen falta.
//
// Encabezados EXACTOS que reconoce lib/excel/parseCartera.ts (formato "plano").
// El parser ignora mayúsculas/acentos y el orden de columnas es libre, pero SIEMPRE
// lee la PRIMERA hoja del archivo → por eso Facturas y Pagos van en archivos separados.

mkdirSync("public/templates", { recursive: true });

function build({ headers, cols, ejemplos, dataSheet, instrucciones, out }) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...ejemplos]);
  ws["!cols"] = cols;
  const wsInfo = XLSX.utils.aoa_to_sheet(instrucciones);
  wsInfo["!cols"] = [{ wch: 110 }];

  const wb = XLSX.utils.book_new();
  // La hoja de datos DEBE ir primero (el parser lee SheetNames[0]).
  XLSX.utils.book_append_sheet(wb, ws, dataSheet);
  XLSX.utils.book_append_sheet(wb, wsInfo, "Instrucciones");

  writeFileSync(out, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  console.log("Generado:", out);
}

// ────────────────────────────── FACTURAS ──────────────────────────────
build({
  dataSheet: "Facturas",
  out: "public/templates/plantilla_cartera_cliente_facturas.xlsx",
  headers: [
    "Folio",
    "Fecha Emisión",
    "Fecha Vencimiento",
    "Subtotal",
    "IVA",
    "Total",
    "UUID Fiscal",
  ],
  cols: [
    { wch: 14 }, // Folio
    { wch: 16 }, // Fecha Emisión
    { wch: 18 }, // Fecha Vencimiento
    { wch: 14 }, // Subtotal
    { wch: 12 }, // IVA
    { wch: 14 }, // Total
    { wch: 38 }, // UUID Fiscal
  ],
  ejemplos: [
    ["A1234", "15/ENE/2026", "14/FEB/2026", 9500.0, 1520.0, 12500.0, "1A2B3C4D-5E6F-7A8B-9C0D-1E2F3A4B5C6D"],
    ["A1290", "20/ENE/2026", "19/FEB/2026", "", "", 4380.5, ""],
  ],
  instrucciones: [
    ["PLANTILLA DE CARTERA POR CLIENTE — FACTURAS"],
    [""],
    ["Úsala en la pestaña 'Facturas' del botón 'Cargar cartera' de la cuenta."],
    ["Todas las filas se cargan a ESTA cuenta (no necesita # de cliente)."],
    [""],
    ["Cómo llenarla:"],
    ["1. Borra las 2 filas de ejemplo y captura una fila por cada factura."],
    ["2. No cambies los nombres de los encabezados de la hoja 'Facturas'."],
    ["3. Sube el archivo tal cual (.xlsx). El sistema lee la primera hoja."],
    [""],
    ["Reglas de cada columna:"],
    ["Folio              OBLIGATORIA. Único en el sistema. Si manejas serie+folio, júntalos (serie A + 1234 = A1234)."],
    ["                   Hace 'upsert' por folio: si el folio ya existe, lo actualiza; si no, lo crea."],
    ["Fecha Emisión      OBLIGATORIA. Formatos válidos: 15/ENE/2026, 15/01/2026, 2026-01-15, o fecha de Excel."],
    ["Fecha Vencimiento  Recomendada. Mismos formatos. Si ya pasó, la factura se marca 'vencida'."],
    ["Subtotal           Opcional. Solo informativo."],
    ["IVA                Opcional. Solo informativo."],
    ["Total              OBLIGATORIA, mayor a 0. Es el monto de la factura."],
    ["UUID Fiscal        Opcional. Folio fiscal (UUID) del CFDI."],
    [""],
    ["Filas con Folio vacío o Total <= 0 se rechazan."],
    [""],
    ["NOTA: si en su lugar tienes el reporte de Antigüedad de Saldos de CONTPAQi,"],
    ["puedes subir ese archivo directo (sin esta plantilla); el sistema lo reconoce"],
    ["y solo AGREGA folios nuevos."],
  ],
});

// ─────────────────────────────── PAGOS ────────────────────────────────
build({
  dataSheet: "Pagos",
  out: "public/templates/plantilla_cartera_cliente_pagos.xlsx",
  headers: ["Fecha Pago", "Folio Factura", "Monto", "Método", "Referencia"],
  cols: [
    { wch: 16 }, // Fecha Pago
    { wch: 16 }, // Folio Factura
    { wch: 14 }, // Monto
    { wch: 16 }, // Método
    { wch: 24 }, // Referencia
  ],
  ejemplos: [
    ["10/FEB/2026", "A1234", 5000.0, "transferencia", "SPEI 0012345"],
    ["12/FEB/2026", "A1234", 7500.0, "cheque", "Cheque 0456"],
  ],
  instrucciones: [
    ["PLANTILLA DE CARTERA POR CLIENTE — PAGOS"],
    [""],
    ["Úsala en la pestaña 'Pagos' del botón 'Cargar cartera' de la cuenta."],
    ["Cada pago se aplica a una factura YA cargada de esta cuenta, buscándola por su Folio."],
    [""],
    ["Cómo llenarla:"],
    ["1. Borra las 2 filas de ejemplo y captura una fila por cada pago/abono."],
    ["2. No cambies los nombres de los encabezados de la hoja 'Pagos'."],
    ["3. Sube el archivo tal cual (.xlsx). El sistema lee la primera hoja."],
    [""],
    ["Reglas de cada columna:"],
    ["Fecha Pago     OBLIGATORIA. Formatos: 10/FEB/2026, 10/02/2026, 2026-02-10, o fecha de Excel."],
    ["Folio Factura  OBLIGATORIA. Debe coincidir con el Folio de una factura ya cargada."],
    ["Monto          OBLIGATORIA, mayor a 0. Importe del pago/abono (puede ser parcial)."],
    ["Método         Opcional. Uno de: transferencia, efectivo, cheque, tarjeta, deposito, otro."],
    ["Referencia     Opcional. Folio del pago, # de cheque, clave SPEI, etc."],
    [""],
    ["Anti-duplicados: si subes el mismo pago (misma factura, fecha, monto y referencia)"],
    ["dos veces, el repetido se ignora."],
  ],
});
