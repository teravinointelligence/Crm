import * as XLSX from "xlsx";
import { mkdirSync, writeFileSync } from "node:fs";

// Plantilla "Ventas por Vendedor" (hoja "Detalle por Cliente").
// Encabezados EXACTOS que reconoce lib/excel/parseVentas.ts → parseVentasExcel.
// El parser ignora mayúsculas y acentos, y el orden de columnas es libre, pero
// la hoja DEBE contener "detalle" en el nombre y tener las columnas Vendedor + # Cliente.
// NOTA: el reporte crudo CONTPAQ ("Reporte de Ventas por Cliente") NO usa esta
// plantilla — ese se sube tal cual lo exporta CONTPAQ.

const headers = [
  "Vendedor",
  "# Cliente",
  "Nombre Comercial",
  "No. Factura",
  "Venta Bruta",
  "Neto",
  "Descuento",
  "Neto-Desc",
];

const ejemplos = [
  ["Emmanuel", "175", "HOTEL EJEMPLO SA DE CV", "A1234, A1290", 12500.0, 12500.0, 0, 12500.0],
  ["Citlali", "88", "RESTAURANTE DEMO", "A1305", 8400.5, 9744.58, 1344.08, 8400.5],
];

const wsData = [headers, ...ejemplos];
const ws = XLSX.utils.aoa_to_sheet(wsData);
ws["!cols"] = [
  { wch: 16 }, // Vendedor
  { wch: 12 }, // # Cliente
  { wch: 32 }, // Nombre Comercial
  { wch: 18 }, // No. Factura
  { wch: 14 }, // Venta Bruta
  { wch: 14 }, // Neto
  { wch: 14 }, // Descuento
  { wch: 14 }, // Neto-Desc
];

const instrucciones = [
  ["PLANTILLA DE VENTAS MENSUALES — VENTAS POR VENDEDOR (una fila por cliente)"],
  [""],
  ["Cómo llenarla:"],
  ["1. Borra las 2 filas de ejemplo y captura una fila por cada cliente con ventas en el mes."],
  ["2. No cambies los nombres de los encabezados ni el nombre de la hoja 'Detalle por Cliente'."],
  ["3. El mes del reporte se elige en el CRM al subir el archivo (no va dentro del Excel)."],
  [""],
  ["Reglas de cada columna:"],
  ["Vendedor          Informativo. El vendedor REAL se deriva del cliente asignado en el CRM, no de esta columna."],
  ["# Cliente         OBLIGATORIA para emparejar. Es el # de cliente de CONTPAQi. Los ceros a la izquierda no importan (00175 = 175)."],
  ["Nombre Comercial  Opcional. Nombre/razón social del cliente. Solo de apoyo visual."],
  ["No. Factura       Opcional, SOLO REFERENCIA. Anota aquí la(s) factura(s) del mes (sepáralas con comas). El sistema NO la guarda; sirve para tu control y conciliación."],
  ["Venta Bruta       Monto de venta bruta del mes. Alimenta el total de ventas y el ranking."],
  ["Neto              Opcional. Importe neto antes de descuento."],
  ["Descuento         Opcional. Descuento aplicado."],
  ["Neto-Desc         Opcional. Neto después de descuento."],
  [""],
  ["Emparejamiento: # Cliente CONTPAQi → cuenta del CRM → vendedor asignado."],
  ["Si una cuenta no existe en el CRM o no tiene vendedor asignado, esa fila se reporta como error y no se importa."],
  ["Re-importar el mismo mes ACTUALIZA los datos de ese cliente (upsert por cuenta + periodo)."],
  [""],
  ["¿Tienes el reporte crudo de CONTPAQ con detalle por producto? Súbelo tal cual — es el formato recomendado y NO necesita esta plantilla."],
];
const wsInfo = XLSX.utils.aoa_to_sheet(instrucciones);
wsInfo["!cols"] = [{ wch: 115 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Detalle por Cliente");
XLSX.utils.book_append_sheet(wb, wsInfo, "Instrucciones");

mkdirSync("public/templates", { recursive: true });
const out = "public/templates/plantilla_ventas.xlsx";
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync(out, buf);
console.log("Generado:", out);
