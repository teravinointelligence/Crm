// Pruebas de las exclusiones de destinatarios de cobranza. npm test
//
// Regla registrada: para el Fideicomiso Pedregal, la cobranza va SOLO a Cuentas
// por Pagar; nunca a Jonathan ni a Jairo.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cobranzaRecipients,
  exclusionRulesForAccount,
  isContactExcluded,
} from "../lib/cobranza-recipients.ts";

const pedregal = { business_name: "Pedregal", fiscal_name: "Fideicomiso Pedregal" };

const contactosPedregal = [
  { full_name: "Cuentas por Pagar", email: "cuentasporpagar@pedregal.com", is_primary: true },
  { full_name: "Jonathan Gómez", email: "jonathan@pedregal.com" },
  { full_name: "Jairo Ramírez", email: "jairo@pedregal.com" },
];

test("Pedregal: solo queda Cuentas por Pagar (fuera Jonathan y Jairo)", () => {
  const to = cobranzaRecipients(pedregal, contactosPedregal);
  assert.deepEqual(to, ["cuentasporpagar@pedregal.com"]);
});

test("Pedregal: excluye por nombre aunque el correo no delate a la persona", () => {
  const to = cobranzaRecipients(pedregal, [
    { full_name: "Cuentas por Pagar", email: "cxp@pedregal.com" },
    { full_name: "Jonathan Gómez", email: "jg@otrodominio.com" },
    { full_name: "Jairo Ramírez", email: "jr@otrodominio.com" },
  ]);
  assert.deepEqual(to, ["cxp@pedregal.com"]);
});

test("Pedregal: excluye por correo aunque el nombre venga vacío", () => {
  const to = cobranzaRecipients(pedregal, [
    { full_name: null, email: "cuentasporpagar@pedregal.com" },
    { full_name: null, email: "JONATHAN@pedregal.com" },
    { full_name: null, email: "Jairo@pedregal.com" },
  ]);
  assert.deepEqual(to, ["cuentasporpagar@pedregal.com"]);
});

test("la cuenta califica por nombre comercial o fiscal, sin acentos ni mayúsculas", () => {
  assert.equal(exclusionRulesForAccount(["FIDEICOMISO PEDREGAL"]).length, 1);
  assert.equal(exclusionRulesForAccount([null, "El Pedregal S.A."]).length, 1);
  assert.equal(exclusionRulesForAccount(["Otra Cuenta"]).length, 0);
});

test("otras cuentas no se ven afectadas: Jonathan y Jairo sí reciben", () => {
  const otra = { business_name: "Vinos del Valle", fiscal_name: "Vinos del Valle SA de CV" };
  const to = cobranzaRecipients(otra, [
    { full_name: "Jonathan Gómez", email: "jonathan@vinos.com" },
    { full_name: "Jairo Ramírez", email: "jairo@vinos.com" },
  ]);
  assert.deepEqual(to, ["jonathan@vinos.com", "jairo@vinos.com"]);
});

test("deduplica correos sin distinguir mayúsculas y conserva el orden", () => {
  const to = cobranzaRecipients(
    { business_name: "Cliente", fiscal_name: null },
    [
      { full_name: "A", email: "uno@x.com" },
      { full_name: "B", email: "UNO@x.com" },
      { full_name: "C", email: "dos@x.com" },
    ],
  );
  assert.deepEqual(to, ["uno@x.com", "dos@x.com"]);
});

test("isContactExcluded es no-op cuando no hay reglas para la cuenta", () => {
  const rules = exclusionRulesForAccount(["Cuenta Cualquiera"]);
  assert.equal(isContactExcluded({ full_name: "Jonathan", email: "j@x.com" }, rules), false);
});
