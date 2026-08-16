// Pruebas de la selección de destinatarios de los correos de cobro. npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCobranzaEmails } from "../lib/cobranza-recipients.ts";

test("si hay contactos marcados, solo envía a los marcados", () => {
  const emails = pickCobranzaEmails("Hotel Aman", [
    { full_name: "Ana Admin", email: "ana@hotel.com", cobranza_recipient: true },
    { full_name: "Beto Compras", email: "beto@hotel.com", cobranza_recipient: false },
    { full_name: "Caro Chef", email: "caro@hotel.com", cobranza_recipient: null },
  ]);
  assert.deepEqual(emails, ["ana@hotel.com"]);
});

test("si NADIE está marcado, cae a todos los contactos con correo", () => {
  const emails = pickCobranzaEmails("Hotel Aman", [
    { full_name: "Ana", email: "ana@hotel.com", cobranza_recipient: false },
    { full_name: "Beto", email: "beto@hotel.com", cobranza_recipient: false },
  ]);
  assert.deepEqual(emails, ["ana@hotel.com", "beto@hotel.com"]);
});

test("respeta el orden recibido (principal primero) y varios marcados", () => {
  const emails = pickCobranzaEmails("Hotel Aman", [
    { full_name: "Ana", email: "ana@hotel.com", cobranza_recipient: true },
    { full_name: "Beto", email: "beto@hotel.com", cobranza_recipient: true },
  ]);
  assert.deepEqual(emails, ["ana@hotel.com", "beto@hotel.com"]);
});

test("aplica exclusiones aunque el contacto esté marcado (Pedregal: Jonathan/Jairo)", () => {
  const emails = pickCobranzaEmails("Fideicomiso Operador Pedregal", [
    { full_name: "Jonathan", email: "jonathan@x.com", cobranza_recipient: true },
    { full_name: "Admin Pedregal", email: "admin@x.com", cobranza_recipient: true },
  ]);
  assert.deepEqual(emails, ["admin@x.com"]);
});

test("exclusión aplica también en el fallback (nadie marcado)", () => {
  const emails = pickCobranzaEmails("Pedregal Fideicomiso", [
    { full_name: "Jairo López", email: "jairo@x.com", cobranza_recipient: false },
    { full_name: "María Admin", email: "maria@x.com", cobranza_recipient: false },
  ]);
  assert.deepEqual(emails, ["maria@x.com"]);
});

test("ignora correos vacíos/ inválidos y deduplica sin distinguir mayúsculas", () => {
  const emails = pickCobranzaEmails("Hotel Aman", [
    { full_name: "Ana", email: "ANA@hotel.com", cobranza_recipient: true },
    { full_name: "Ana2", email: "ana@hotel.com", cobranza_recipient: true },
    { full_name: "SinCorreo", email: "  ", cobranza_recipient: true },
    { full_name: "Malo", email: "no-arroba", cobranza_recipient: true },
  ]);
  assert.deepEqual(emails, ["ANA@hotel.com"]);
});
