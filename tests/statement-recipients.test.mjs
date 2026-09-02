import test from "node:test";
import assert from "node:assert/strict";

import { statementRecipientEmails } from "../lib/statement-recipients.ts";

test("solo incluye contactos seleccionados para el estado de cuenta", () => {
  assert.deepEqual(
    statementRecipientEmails([
      { email: "compras@cliente.com", receives_statement: true },
      { email: "sommelier@cliente.com", receives_statement: false },
      { email: "contabilidad@cliente.com", receives_statement: true },
    ]),
    ["compras@cliente.com", "contabilidad@cliente.com"],
  );
});

test("deduplica correos y descarta valores vacíos o inválidos", () => {
  assert.deepEqual(
    statementRecipientEmails([
      { email: " Cobranza@Cliente.com ", receives_statement: true },
      { email: "cobranza@cliente.com", receives_statement: true },
      { email: "sin-arroba", receives_statement: true },
      { email: null, receives_statement: true },
    ]),
    ["Cobranza@Cliente.com"],
  );
});
