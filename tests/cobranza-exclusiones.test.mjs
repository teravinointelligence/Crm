// Pruebas de la exclusión de destinatarios en correos de cobro. npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { excluirDeCobranza } from "../lib/cobranza-exclusiones.ts";

test("Pedregal Fideicomiso: excluye a Jonathan y Jairo por nombre", () => {
  const cuenta = "Pedregal Fideicomiso";
  assert.equal(excluirDeCobranza(cuenta, { full_name: "Jonathan Pérez", email: "jonathan@x.com" }), true);
  assert.equal(excluirDeCobranza(cuenta, { full_name: "Jairo López", email: "jairo@x.com" }), true);
});

test("Pedregal Fideicomiso: no excluye a otros contactos", () => {
  const cuenta = "Pedregal Fideicomiso";
  assert.equal(excluirDeCobranza(cuenta, { full_name: "María González", email: "maria@x.com" }), false);
});

test("normaliza acentos y mayúsculas en nombre y cuenta", () => {
  assert.equal(
    excluirDeCobranza("FIDEICOMISO PEDREGAL S.A.", { full_name: "JÓNATHAN", email: "j@x.com" }),
    true,
  );
});

test("la regla no aplica a otras cuentas", () => {
  assert.equal(excluirDeCobranza("Hotel Aman", { full_name: "Jonathan Ruiz", email: "j@x.com" }), false);
  assert.equal(excluirDeCobranza("Bodega Norte", { full_name: "Jairo Méndez", email: "j@x.com" }), false);
});

test("acepta cuenta combinada (fiscal | comercial)", () => {
  const cuenta = "Pedregal Fideicomiso | Pedregal";
  assert.equal(excluirDeCobranza(cuenta, { full_name: "Jonathan", email: "j@x.com" }), true);
});

test("tolera nombre/correo nulos", () => {
  assert.equal(excluirDeCobranza("Pedregal Fideicomiso", { full_name: null, email: null }), false);
});
