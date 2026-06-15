// Candado de alcance por vendedor en el asistente. Simula el contexto de un
// vendedor (canSeeFinance=false) vs admin/contador (canSeeFinance=true) con un
// query builder falso y verifica que las consultas se acoten a SUS cuentas. npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { ownScope, applyOwnScope } from "../lib/asistente/scope.ts";

// Cliente Supabase falso: registra cada .eq() y permite encadenar.
function mockQuery() {
  const calls = [];
  const q = { calls, eq(column, value) { calls.push([column, value]); return q; } };
  return q;
}

const REP = { rep: { id: "rep-1" }, canSeeFinance: false }; // vendedor
const ADMIN = { rep: { id: "admin-1" }, canSeeFinance: true };
const CONTADOR = { rep: { id: "cont-1" }, canSeeFinance: true };

test("ownScope: el vendedor queda acotado; admin/contador no", () => {
  assert.equal(ownScope(REP), true);
  assert.equal(ownScope(ADMIN), false);
  assert.equal(ownScope(CONTADOR), false);
});

test("vendedor → la consulta se filtra a SUS cuentas (assigned_rep_id)", () => {
  const q = mockQuery();
  const out = applyOwnScope(q, REP);
  assert.equal(out, q); // sigue siendo encadenable
  assert.deepEqual(q.calls, [["assigned_rep_id", "rep-1"]]);
});

test("admin → la consulta NO se filtra (ve todo)", () => {
  const q = mockQuery();
  applyOwnScope(q, ADMIN);
  assert.equal(q.calls.length, 0);
});

test("contador (lectura global) → la consulta NO se filtra", () => {
  const q = mockQuery();
  applyOwnScope(q, CONTADOR);
  assert.equal(q.calls.length, 0);
});

test("el resultado del candado sigue siendo encadenable (.eq posterior)", () => {
  const q = mockQuery();
  applyOwnScope(q, REP).eq("region", "Los Cabos");
  assert.deepEqual(q.calls, [
    ["assigned_rep_id", "rep-1"],
    ["region", "Los Cabos"],
  ]);
});
