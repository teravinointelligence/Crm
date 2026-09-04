// Pruebas de las reglas de "esta cuenta no puede comprar". npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeBlockOn,
  blockLabel,
  blockedAccountIds,
  compareBlocks,
  isBlockActiveOn,
} from "../lib/purchase-blocks.ts";

test("una pausa con fecha de fin cubre sus extremos", () => {
  const b = { start_date: "2026-05-01", end_date: "2026-10-31" };
  assert.equal(isBlockActiveOn(b, "2026-04-30"), false);
  assert.equal(isBlockActiveOn(b, "2026-05-01"), true, "el primer día ya cuenta");
  assert.equal(isBlockActiveOn(b, "2026-08-19"), true);
  assert.equal(isBlockActiveOn(b, "2026-10-31"), true, "el último día todavía cuenta");
  assert.equal(isBlockActiveOn(b, "2026-11-01"), false);
});

test("una pausa sin fecha de fin no caduca sola", () => {
  const b = { start_date: "2026-05-01", end_date: null };
  assert.equal(isBlockActiveOn(b, "2026-04-30"), false);
  assert.equal(isBlockActiveOn(b, "2030-01-01"), true);
});

test("entre pausas encimadas gana la que termina más tarde", () => {
  const corta = { id: "a", start_date: "2026-05-01", end_date: "2026-06-30" };
  const larga = { id: "b", start_date: "2026-05-15", end_date: "2026-10-31" };
  assert.equal(activeBlockOn([corta, larga], "2026-06-01").id, "b");
  assert.equal(activeBlockOn([larga, corta], "2026-06-01").id, "b");
});

test("una pausa abierta manda sobre cualquiera con fecha de fin", () => {
  const conFin = { id: "a", start_date: "2026-05-01", end_date: "2026-12-31" };
  const abierta = { id: "b", start_date: "2026-05-15", end_date: null };
  assert.equal(activeBlockOn([conFin, abierta], "2026-06-01").id, "b");
  assert.equal(activeBlockOn([abierta, conFin], "2026-06-01").id, "b");
});

test("sin pausa vigente devuelve null", () => {
  const vieja = { id: "a", start_date: "2025-05-01", end_date: "2025-10-31" };
  assert.equal(activeBlockOn([vieja], "2026-08-19"), null);
  assert.equal(activeBlockOn([], "2026-08-19"), null);
});

test("el panel lista primero la vigente y luego las más recientes", () => {
  const hoy = "2026-08-19";
  const lista = [
    { id: "vieja", start_date: "2024-05-01", end_date: "2024-10-31" },
    { id: "vigente", start_date: "2026-05-01", end_date: "2026-10-31" },
    { id: "pasada", start_date: "2025-05-01", end_date: "2025-10-31" },
  ];
  const orden = [...lista].sort((a, b) => compareBlocks(a, b, hoy)).map((b) => b.id);
  assert.deepEqual(orden, ["vigente", "pasada", "vieja"]);
});

test("las cuentas en pausa se pueden excluir de las alertas de churn", () => {
  const hoy = "2026-08-19";
  const blocks = [
    { account_id: "hotel", start_date: "2026-05-01", end_date: "2026-10-31" },
    { account_id: "resto", start_date: "2025-05-01", end_date: "2025-10-31" },
    { account_id: "bar", start_date: "2026-08-01", end_date: null },
  ];
  const ids = blockedAccountIds(blocks, hoy);
  assert.equal(ids.has("hotel"), true);
  assert.equal(ids.has("bar"), true);
  assert.equal(ids.has("resto"), false, "una pausa del año pasado ya no silencia nada");
});

test("la etiqueta distingue la pausa con fin de la abierta", () => {
  assert.match(
    blockLabel({ reason: "temporada_baja", start_date: "2026-05-01", end_date: "2026-10-31" }),
    /^Temporada baja · del 2026-05-01 al 2026-10-31$/,
  );
  assert.match(
    blockLabel({ reason: "remodelacion", start_date: "2026-05-01", end_date: null }),
    /sin fecha de reapertura$/,
  );
});
