import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideReassignment,
  REASSIGN_AFTER_DAYS,
  REASSIGN_NOTICE_DAYS,
  REASSIGN_WARN_DAYS,
  SABRINA_POOL_REP_ID,
} from "../lib/reassignment-policy.ts";

const SELLER_ID = "00000000-0000-4000-a000-000000000001";

function decision(daysInactive, overrides = {}) {
  return decideReassignment({
    assignedRepId: SELLER_ID,
    daysInactive,
    daysSinceWarning: null,
    activitySinceWarning: false,
    ...overrides,
  });
}

test("la regla avisa a los 53 días y reasigna normalmente a los 60", () => {
  assert.equal(REASSIGN_WARN_DAYS, 53);
  assert.equal(REASSIGN_AFTER_DAYS, 60);
  assert.equal(REASSIGN_NOTICE_DAYS, 7);
  assert.deepEqual(decision(52), { action: "ignore", daysRemaining: 7 });
  assert.deepEqual(decision(53), { action: "warn", daysRemaining: 7 });
  assert.deepEqual(decision(59, { daysSinceWarning: 6 }), {
    action: "pending",
    daysRemaining: 1,
  });
  assert.deepEqual(decision(60, { daysSinceWarning: 7 }), {
    action: "reassign",
    daysRemaining: 0,
  });
});

test("una cuenta ya vencida recibe siete días completos si nunca fue avisada", () => {
  assert.deepEqual(decision(60), { action: "warn", daysRemaining: 7 });
  assert.deepEqual(decision(66, { daysSinceWarning: 6 }), {
    action: "pending",
    daysRemaining: 1,
  });
  assert.deepEqual(decision(67, { daysSinceWarning: 7 }), {
    action: "reassign",
    daysRemaining: 0,
  });
});

test("una actividad posterior al aviso conserva la cuenta y limpia el aviso", () => {
  assert.equal(
    decision(53, { daysSinceWarning: 1, activitySinceWarning: true }).action,
    "recover",
  );
});

test("Sabrina y las cuentas sin vendedor quedan fuera de la regla", () => {
  assert.equal(decision(120, { assignedRepId: SABRINA_POOL_REP_ID }).action, "ignore");
  assert.equal(decision(120, { assignedRepId: null }).action, "ignore");
});
