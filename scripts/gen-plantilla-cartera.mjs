import * as XLSX from "xlsx";
import { mkdirSync, writeFileSync } from "node:fs";

// Plantilla "Cartera - Saldo Neto" (Camino A).
// Encabezados EXACTOS que reconoce lib/excel/parseCartera.ts (formato "plano").
// El parser ignora mayúsculas y acentos, y el orden de columnas es libre.

const headers = [
  "# Cliente",
  "Folio",
  "Fecha Emisión",
  "Fecha Vencimiento",
  "Total",
  "RFC",
  "Cliente",
];

const ejemplos = [
  ["175", "A1234", "15/ENE/2026", "14/FEB/2026", 12500.0, "XAXX010101000", "HOTEL EJEMPLO SA DE CV"],
  ["88", "A1290", "20/ENE/2026", "19/FEB/2026", 4380.5, "", "RESTAURANTE DEMO"],
];

const wsData = [headers, ...ejemplos];
const ws = XLSX.utils.aoa_to_sheet(wsData);
ws["!cols"] = [
  { wch: 12 }, // # Cliente
  { wch: 14 }, // Folio
  { wch: 16 }, // Fecha Emisión
  { wch: 18 }, // Fecha Vencimiento
  { wch: 14 }, // Total
  { wch: 16 }, // RFC
  { wch: 32 }, // Cliente
];

const instrucciones = [
  ["PLANTILLA DE CARTERA — SALDO NETO (una fila por factura pendiente)"],
  [""],
  ["Cómo llenarla:"],
  ["1. Borra las 2 filas de ejemplo y captura una fila por cada factura con saldo."],
  ["2. En la columna 'Total' va el SALDO PENDIENTE de hoy (lo que falta cobrar), no el total original."],
  ["3. No cambies los nombres de los encabezados de la hoja 'Cartera'."],
  [""],
  ["Reglas de cada columna:"],
  ["# Cliente        Obligatoria para emparejar. Es el # de cliente de CONTPAQi. Los ceros a la izquierda no importan (00175 = 175)."],
  ["Folio            OBLIGATORIA. Debe ser único en todo el sistema. Si manejas serie+folio, júntalos (serie A + folio 1234 = A1234)."],
  ["Fecha Emisión    OBLIGATORIA. Formatos válidos: 15/ENE/2026, 15/01/2026, 2026-01-15, o fecha de Excel."],
  ["Fecha Vencimiento  Recomendada. Mismos formatos que Fecha Emisión."],
  ["Total            OBLIGATORIA, mayor a 0. Aquí va el saldo pendiente."],
  ["RFC              Opcional. Ayuda a emparejar si falta el # de cliente."],
  ["Cliente          Opcional. Nombre/razón social. Ayuda a emparejar."],
  [""],
  ["Emparejamiento con la cuenta: # Cliente → RFC → nombre similar."],
  ["Filas con Folio repetido o Total <= 0 se rechazan."],
];
const wsInfo = XLSX.utils.aoa_to_sheet(instrucciones);
wsInfo["!cols"] = [{ wch: 110 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Cartera");
XLSX.utils.book_append_sheet(wb, wsInfo, "Instrucciones");

mkdirSync("public/templates", { recursive: true });
const out = "public/templates/plantilla_cartera.xlsx";
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync(out, buf);
console.log("Generado:", out);
