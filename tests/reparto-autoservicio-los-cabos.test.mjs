import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canSelfClaimLosCabos,
  isLosCabosDriver,
} from "../lib/reparto/autoservicio-los-cabos.ts";

test("solo los tres choferes autorizados pertenecen a la ruta de Los Cabos", () => {
  assert.equal(isLosCabosDriver("anibal@teravino.com"), true);
  assert.equal(isLosCabosDriver("GONZALO@TERAVINO.COM"), true);
  assert.equal(isLosCabosDriver("isai@teravino.com"), true);
  assert.equal(isLosCabosDriver("martin@teravino.com"), false);
});

test("un chofer solo puede tomar pedidos cuando RH lo confirma disponible", () => {
  const available = ["anibal@teravino.com", "gonzalo@teravino.com"];
  assert.equal(canSelfClaimLosCabos("anibal@teravino.com", available), true);
  assert.equal(canSelfClaimLosCabos("isai@teravino.com", available), false);
  assert.equal(canSelfClaimLosCabos("martin@teravino.com", available), false);
});
