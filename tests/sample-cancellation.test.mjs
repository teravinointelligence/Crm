import assert from "node:assert/strict";
import test from "node:test";

import {
  canRequestSampleCancellation,
  isSampleCancellationPending,
} from "../lib/sample-cancellation.ts";

test("detecta una cancelación pendiente hasta que administración decide", () => {
  assert.equal(isSampleCancellationPending("2026-08-25T17:00:00Z", null), true);
  assert.equal(isSampleCancellationPending("2026-08-25T17:00:00Z", "rechazada"), false);
  assert.equal(isSampleCancellationPending(null, null), false);
});

test("el vendedor puede pedir cancelación de sus muestras activas", () => {
  for (const status of ["borrador", "enviada", "aprobada"]) {
    assert.equal(
      canRequestSampleCancellation({
        status,
        isOwner: true,
        isAdmin: false,
        requestedAt: null,
        decision: null,
      }),
      true,
    );
  }
});

test("administración conserva la opción de iniciar una cancelación", () => {
  assert.equal(
    canRequestSampleCancellation({
      status: "aprobada",
      isOwner: false,
      isAdmin: true,
      requestedAt: null,
      decision: null,
    }),
    true,
  );
});

test("bloquea solicitudes ajenas, duplicadas y estados finales", () => {
  assert.equal(
    canRequestSampleCancellation({
      status: "enviada",
      isOwner: false,
      isAdmin: false,
      requestedAt: null,
      decision: null,
    }),
    false,
  );
  assert.equal(
    canRequestSampleCancellation({
      status: "enviada",
      isOwner: true,
      isAdmin: false,
      requestedAt: "2026-08-25T17:00:00Z",
      decision: null,
    }),
    false,
  );
  for (const status of ["entregada", "rechazada", "cancelada"]) {
    assert.equal(
      canRequestSampleCancellation({
        status,
        isOwner: true,
        isAdmin: false,
        requestedAt: null,
        decision: null,
      }),
      false,
    );
  }
});
