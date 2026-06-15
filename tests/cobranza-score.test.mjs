// Pruebas del score de priorización de cobranza (determinístico). npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCobranzaRanking, paymentProfile } from "../lib/cobranza-score.ts";

const NOW = new Date("2026-06-14T12:00:00Z").getTime();

const base = (over = {}) => ({
  account_id: "a",
  business_name: "Cliente",
  client_number: "1",
  assigned_rep_id: null,
  saldo_vencido: 10000,
  saldo_pendiente: 10000,
  dias_vencido: 10,
  total_facturado: 100000,
  total_pagado: 90000,
  last_payment_date: "2026-06-01",
  payment_count: 12,
  last_contact_at: null,
  ...over,
});

test("perfil de pago: bueno / irregular / moroso", () => {
  assert.equal(paymentProfile({ total_facturado: 100, total_pagado: 95, payment_count: 5, saldo_pendiente: 5, last_payment_date: "2026-06-01", now: NOW }), "buen_pagador");
  assert.equal(paymentProfile({ total_facturado: 100, total_pagado: 20, payment_count: 2, saldo_pendiente: 80, last_payment_date: "2026-01-01", now: NOW }), "moroso");
  assert.equal(paymentProfile({ total_facturado: 100, total_pagado: 0, payment_count: 0, saldo_pendiente: 100, last_payment_date: null, now: NOW }), "moroso");
  assert.equal(paymentProfile({ total_facturado: 100, total_pagado: 60, payment_count: 3, saldo_pendiente: 40, last_payment_date: "2026-06-01", now: NOW }), "irregular");
});

test("más monto vencido = más prioridad (igual todo lo demás)", () => {
  const r = buildCobranzaRanking([
    base({ account_id: "chico", saldo_vencido: 5000 }),
    base({ account_id: "grande", saldo_vencido: 200000 }),
  ], NOW);
  assert.equal(r[0].account_id, "grande");
  assert.ok(r[0].score > r[1].score);
});

test("contacto reciente baja la prioridad", () => {
  const r = buildCobranzaRanking([
    base({ account_id: "sin_contacto", last_contact_at: null }),
    base({ account_id: "contactado_ayer", last_contact_at: "2026-06-13T12:00:00Z" }),
  ], NOW);
  assert.equal(r[0].account_id, "sin_contacto");
});

test("moroso pesa más que buen pagador", () => {
  const r = buildCobranzaRanking([
    base({ account_id: "bueno", total_pagado: 95000, payment_count: 20 }),
    base({ account_id: "moroso", total_pagado: 10000, payment_count: 1, saldo_pendiente: 90000 }),
  ], NOW);
  assert.equal(r[0].account_id, "moroso");
});

test("el por qué incluye monto, días, perfil y contacto", () => {
  const [r] = buildCobranzaRanking([base({ dias_vencido: 33 })], NOW);
  assert.match(r.why, /33 días/);
  assert.match(r.why, /pagador|moroso|buen/);
  assert.match(r.why, /contacto/);
});
