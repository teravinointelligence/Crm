import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectarPlazaAutomatica,
  detectarPlazaOperativa,
  nombresClienteCoinciden,
  resolverPlazaConsistente,
} from "../lib/reparto/asignacion-automatica.ts";

test("Baja California Norte, Tijuana y Ensenada se asignan a la plaza de Emmanuel", () => {
  for (const ubicacion of [
    { region: "Baja California Norte" },
    { region: "Tijuana", ciudad: "TIJUANA" },
    { region: "Tijuana", ciudad: "Ensenada" },
    { region: "BCN", ciudad: "Mexicali" },
  ]) {
    assert.equal(detectarPlazaAutomatica(ubicacion), "baja_california_norte");
  }
});

test("Puerto Vallarta y todo Nayarit se asignan a la plaza de Martín", () => {
  for (const ubicacion of [
    { region: "Puerto Vallarta", ciudad: "Puerto Vallarta" },
    { region: "Nayarit", ciudad: "Punta de Mita" },
    { region: "Nayarit", ciudad: "Bahía de Banderas" },
    { region: "Nayarit", ciudad: "Tepic" },
  ]) {
    assert.equal(detectarPlazaAutomatica(ubicacion), "puerto_vallarta_nayarit");
  }
});

test("solo la ciudad de La Paz entra a la regla de Mauricio", () => {
  assert.equal(detectarPlazaAutomatica({ region: "La Paz", ciudad: "La Paz" }), "la_paz");
  assert.equal(detectarPlazaAutomatica({ region: "La Paz", ciudad: "Los Barriles" }), null);
  assert.equal(detectarPlazaAutomatica({ region: "La Paz", ciudad: "Todos Santos" }), null);
});

test("Los Cabos y Baja California Sur permanecen para asignación manual", () => {
  assert.equal(detectarPlazaAutomatica({ region: "Baja California Sur", ciudad: "Los Cabos" }), null);
  assert.equal(detectarPlazaAutomatica({ region: "Los Cabos", ciudad: "Cabo San Lucas" }), null);
});

test("Los Cabos se identifica como plaza operativa para el autoservicio de choferes", () => {
  for (const ubicacion of [
    { region: "Baja California Sur", ciudad: "Los Cabos" },
    { region: "Los Cabos", ciudad: "Cabo San Lucas" },
    { region: "La Paz", ciudad: "Todos Santos" },
    { region: "Baja California Sur", ciudad: "Pescadero" },
    { region: "Baja California Sur", ciudad: "Miraflores" },
    { region: "La Paz", ciudad: "Los Barriles" },
  ]) {
    assert.equal(detectarPlazaOperativa(ubicacion), "los_cabos");
  }
});

test("RFC duplicado con la misma plaza sigue siendo seguro", () => {
  assert.deepEqual(
    resolverPlazaConsistente([
      { region: "Nayarit", ciudad: "Punta de Mita" },
      { region: "Puerto Vallarta", ciudad: "Puerto Vallarta" },
    ]),
    { plaza: "puerto_vallarta_nayarit", motivo: "ubicacion_reconocida" },
  );
});

test("RFC duplicado con plazas distintas queda sin asignar", () => {
  assert.deepEqual(
    resolverPlazaConsistente([
      { region: "Tijuana", ciudad: "Tijuana" },
      { region: "La Paz", ciudad: "La Paz" },
    ]),
    { plaza: null, motivo: "ubicaciones_en_conflicto" },
  );
});

test("un RFC genérico se puede desambiguar por nombre exacto normalizado", () => {
  assert.equal(nombresClienteCoinciden("VENTAS TIJUANA MOSTRADOR", "Ventas Tijuana Mostrador"), true);
  assert.equal(nombresClienteCoinciden("VENTAS TIJUANA MOSTRADOR", "Ventas Mostrador La Paz"), false);
});
