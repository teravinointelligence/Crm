// Pruebas de las llaves de pagador para conciliación bancaria (lib/bank/aliases.ts).
// En especial la CLABE ordenante de SPEI interbancario (kind 'clabe'). npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBnet, extractClabe, isValidClabe, normalizeClabe, payerKeys } from "../lib/bank/aliases.ts";

const BANORTE_20 = "00072041011490019166"; // como lo imprime BBVA (cliente 389, Doña Ines)
const BANORTE_18 = "072041011490019166"; // CLABE canónica (072 = Banorte)

test("valida el dígito verificador de una CLABE real", () => {
  assert.equal(isValidClabe(BANORTE_18), true);
  assert.equal(isValidClabe("072041011490019160"), false); // verificador alterado
  assert.equal(isValidClabe("0720410114900191"), false); // largo incorrecto
});

test("normaliza la versión de 20 dígitos del estado de cuenta a 18", () => {
  assert.equal(normalizeClabe(BANORTE_20), BANORTE_18);
  assert.equal(normalizeClabe(BANORTE_18), BANORTE_18);
  assert.equal(normalizeClabe("0720 4101 1490 0191 66"), BANORTE_18);
  assert.equal(normalizeClabe("1522588646"), null); // un BNET no es CLABE
  assert.equal(normalizeClabe(null), null);
});

test("extrae la cuenta ordenante de un SPEI RECIBIDO interbancario", () => {
  const desc = `SPEI RECIBIDO BANORTE/0126985609 072 0060626 JULIO ${BANORTE_20} Teravino`;
  assert.equal(extractClabe(desc), BANORTE_18);
  assert.equal(extractClabe(`SPEI RECIBIDO BANORTE ${BANORTE_18}`), BANORTE_18);
});

test("no confunde folios o claves de rastreo largas con una CLABE", () => {
  // 25 dígitos seguidos (referencia + fecha pegadas) → no es una CLABE.
  assert.equal(extractClabe("SPEI RECIBIDO HSBC/0107484430 021 0000001326500350120102026"), null);
  // Concepto BBVA→BBVA: trae BNET, no CLABE.
  assert.equal(extractClabe("PAGO CUENTA DE TERCERO/ 0094471023 BNET 1522588646 14164"), null);
  // 18 dígitos con verificador inválido → se ignora.
  assert.equal(extractClabe("SPEI RECIBIDO BANORTE 072041011490019160"), null);
});

test("payerKeys emite la CLABE canónica como llave 'clabe' entre bnet y rfc", () => {
  const keys = payerKeys(`SPEI RECIBIDO BANORTE/0126985609 072 0060626 ${BANORTE_20} JULIO`, "0126985609");
  assert.deepEqual(keys[0], { kind: "clabe", key: BANORTE_18 });
  assert.equal(keys.some((k) => k.kind === "bnet"), false);
});

test("el BNET sigue saliendo del concepto PAGO CUENTA DE TERCERO", () => {
  const desc = "PAGO CUENTA DE TERCERO/ 0027257151 BNET 0112457822 agricole";
  assert.equal(extractBnet(desc), "0112457822");
  const keys = payerKeys(desc, "0027257151");
  assert.deepEqual(keys[0], { kind: "bnet", key: "0112457822" });
  assert.equal(keys.some((k) => k.kind === "clabe"), false);
});
