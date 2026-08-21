import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoMatchDriveFile,
  normalizeTechnicalSheetKey,
} from "../lib/technical-sheet-match.mjs";

const base = {
  active: true,
  technical_sheet_path: null,
  technical_sheet_file_name: null,
  technical_sheet_updated_at: null,
  technical_sheet_drive_file_id: null,
  technical_sheet_drive_file_name: null,
  technical_sheet_drive_url: null,
  technical_sheet_drive_modified_at: null,
  technical_sheet_drive_md5: null,
  technical_sheet_drive_synced_at: null,
  technical_sheet_drive_sync_error: null,
};

test("normaliza prefijos, acentos y separadores", () => {
  assert.equal(
    normalizeTechnicalSheetKey("Ficha_Técnica_Ánima-Negra 2021.pdf"),
    "animanegra2021",
  );
});

test("vincula Brewer-Clifton por nombre y añada", () => {
  const file = { name: "Ficha_Tecnica_Brewer_Clifton_Chardonnay_2021.pdf" };
  const products = [
    { ...base, id: "2020", name: "Brewer-Clifton Chardonnay", supplier: "Brewer-Clifton", sku: null, vintage: "2020" },
    { ...base, id: "2021", name: "Brewer-Clifton Chardonnay", supplier: "Brewer-Clifton", sku: "BREWER-CLIFTON-CHARDONNAY-2021-750", vintage: "2021" },
  ];
  assert.equal(autoMatchDriveFile(file, products)?.id, "2021");
});

test("prioriza una coincidencia exacta de SKU", () => {
  const file = { name: "Ficha_Tecnica_SKU-ABC-123.pdf" };
  const products = [
    { ...base, id: "a", name: "Reserva Especial", supplier: "Casa Uno", sku: "SKU-ABC-123", vintage: null },
    { ...base, id: "b", name: "Reserva Especial", supplier: "Casa Dos", sku: "SKU-XYZ-999", vintage: null },
  ];
  assert.equal(autoMatchDriveFile(file, products)?.id, "a");
});

test("no adivina cuando dos productos empatan", () => {
  const file = { name: "Ficha_Tecnica_Reserva_Especial.pdf" };
  const products = [
    { ...base, id: "a", name: "Reserva Especial", supplier: "Casa", sku: null, vintage: null },
    { ...base, id: "b", name: "Reserva Especial", supplier: "Casa", sku: null, vintage: null },
  ];
  assert.equal(autoMatchDriveFile(file, products), null);
});
