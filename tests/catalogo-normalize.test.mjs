// Pruebas del motor de normalización del catálogo (reglas).
// Corre con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeProduct, inferVintage, inferVolumeMl } from "../lib/catalogo/normalize.mjs";

function catSuggestion(p) {
  return analyzeProduct(p).suggestions.find((s) => s.field === "category") ?? null;
}

test("corrige categorías mal capturadas (casos reales)", () => {
  // Destilado → Vino Tinto (palabra "tinto" en el nombre)
  let s = catSuggestion({ name: "Bruma Casa Jipi Tinto", supplier: "Bruma", category: "destilado" });
  assert.equal(s.suggested, "vino_tinto");
  assert.equal(s.confidence, "alta");

  // Cerveza → Vino Tinto (varietal tinto)
  s = catSuggestion({ name: "Cardinale Cabernet Sauvignon", supplier: "Cardinale", category: "cerveza" });
  assert.equal(s.suggested, "vino_tinto");

  // Vino Tinto → Espumoso (champagne / prosecco / cava)
  for (const name of ["Veuve Clicquot Brut Champagne", "La Marca Prosecco DOC", "Codorníu Cava"]) {
    s = catSuggestion({ name, supplier: "X", category: "vino_tinto" });
    assert.equal(s.suggested, "espumoso", `${name} debería ser espumoso`);
  }
});

test("detecta destilados por palabra clave", () => {
  for (const name of ["Don Julio Tequila", "400 Conejos Mezcal", "Bacardí Ron Blanco"]) {
    const s = catSuggestion({ name, supplier: "X", category: "vino_blanco" });
    assert.equal(s.suggested, "destilado", `${name} debería ser destilado`);
  }
});

test("no sugiere cambio cuando la categoría ya es correcta", () => {
  const s = catSuggestion({ name: "Catena Malbec", supplier: "Catena", category: "vino_tinto" });
  assert.equal(s, null);
});

test("marca como ambiguo lo que no tiene señal", () => {
  const r = analyzeProduct({ name: "Reserva Especial de la Casa", supplier: "Bodega X", category: "otro" });
  assert.equal(r.categoryAmbiguous, true);
  assert.equal(r.suggestions.find((x) => x.field === "category"), undefined);
});

test("solo rellena país y varietal vacíos (no pisa lo capturado)", () => {
  // varietal ya capturado → no se sugiere
  const conVarietal = analyzeProduct({ name: "X Chardonnay", supplier: "Y", category: "vino_blanco", varietal: "Chardonnay viejo" });
  assert.equal(conVarietal.suggestions.find((s) => s.field === "varietal"), undefined);
  // varietal vacío → se rellena
  const sinVarietal = analyzeProduct({ name: "X Chardonnay", supplier: "Y", category: "vino_blanco", varietal: null });
  assert.equal(sinVarietal.suggestions.find((s) => s.field === "varietal")?.suggested, "Chardonnay");
});

test("añada: toma años plausibles, ignora números de marca", () => {
  assert.equal(inferVintage({ name: "Cabernet 2019", sku: "" })?.vintage, "2019");
  assert.equal(inferVintage({ name: "Don Julio 1942", sku: "" }), null); // 1942 < 1950 = marca, no añada
  assert.equal(inferVintage({ name: "Brut N.V.", sku: "" })?.vintage, "N.V.");
});

test("formato: lee magnum, litros y mililitros", () => {
  assert.equal(inferVolumeMl({ name: "Catena Malbec Magnum" })?.volume_ml, 1500);
  assert.equal(inferVolumeMl({ name: "Vino 1.5 L" })?.volume_ml, 1500);
  assert.equal(inferVolumeMl({ name: "Vino 375ml" })?.volume_ml, 375);
});
