// Pruebas de la auditoría de entregas de Reparto (pedidos atorados por falta de
// la foto de la factura firmada y sellada). Corre con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIAS_CRITICO,
  agruparPorChofer,
  auditarPendientes,
  diasTranscurridos,
  esEntregadoSinEvidencia,
  esPendienteEvidencia,
  linkWhatsapp,
  mensajeRecordatorio,
  numeroWhatsapp,
  resumenAuditoria,
  severidadPorDias,
  telefonoChofer,
} from "../lib/reparto-auditoria.ts";

const HOY = "2026-08-15";

// --- diasTranscurridos ---

test("cuenta los días entre dos fechas AAAA-MM-DD", () => {
  assert.equal(diasTranscurridos("2026-08-10", HOY), 5);
  assert.equal(diasTranscurridos(HOY, HOY), 0);
});

test("cruza fin de mes sin error de zona horaria", () => {
  assert.equal(diasTranscurridos("2026-07-31", "2026-08-01"), 1);
  assert.equal(diasTranscurridos("2025-12-31", "2026-01-02"), 2);
});

test("fecha inválida o vacía → 0 días (no rompe la auditoría)", () => {
  assert.equal(diasTranscurridos("", HOY), 0);
  assert.equal(diasTranscurridos("ayer", HOY), 0);
});

// --- esPendienteEvidencia ---

const pedido = (over = {}) => ({ id: "p1", estatus: "en_ruta", fecha: "2026-08-12", tieneFoto: false, ...over });

test("en ruta, de días anteriores y sin foto → pendiente de evidencia", () => {
  assert.equal(esPendienteEvidencia(pedido(), HOY), true);
});

test("asignado desde hace días y sin foto → también cuenta", () => {
  assert.equal(esPendienteEvidencia(pedido({ estatus: "asignado" }), HOY), true);
});

test("pedido del día NO cuenta: el chofer sigue en ruta", () => {
  assert.equal(esPendienteEvidencia(pedido({ fecha: HOY }), HOY), false);
});

test("con foto cargada NO cuenta aunque siga en ruta", () => {
  assert.equal(esPendienteEvidencia(pedido({ tieneFoto: true }), HOY), false);
});

test("entregado o no entregado quedan fuera de los pendientes", () => {
  assert.equal(esPendienteEvidencia(pedido({ estatus: "entregado" }), HOY), false);
  assert.equal(esPendienteEvidencia(pedido({ estatus: "no_entregado" }), HOY), false);
  assert.equal(esPendienteEvidencia(pedido({ estatus: "pendiente_asignar" }), HOY), false);
});

// --- entregados sin evidencia ---

test("entregado sin foto se detecta; con foto no", () => {
  assert.equal(esEntregadoSinEvidencia(pedido({ estatus: "entregado" })), true);
  assert.equal(esEntregadoSinEvidencia(pedido({ estatus: "entregado", tieneFoto: true })), false);
  assert.equal(esEntregadoSinEvidencia(pedido()), false);
});

// --- severidad ---

test("a partir de DIAS_CRITICO el atraso es crítico", () => {
  assert.equal(severidadPorDias(DIAS_CRITICO - 1), "atrasado");
  assert.equal(severidadPorDias(DIAS_CRITICO), "critico");
  assert.equal(severidadPorDias(DIAS_CRITICO + 10), "critico");
});

// --- auditarPendientes ---

test("filtra, anota días y ordena del más viejo al más nuevo", () => {
  const items = auditarPendientes(
    [
      pedido({ id: "reciente", fecha: "2026-08-14" }),
      pedido({ id: "viejo", fecha: "2026-08-05" }),
      pedido({ id: "hoy", fecha: HOY }),
      pedido({ id: "con_foto", fecha: "2026-08-01", tieneFoto: true }),
    ],
    HOY,
  );
  assert.deepEqual(items.map((i) => i.id), ["viejo", "reciente"]);
  assert.equal(items[0].dias, 10);
  assert.equal(items[0].severidad, "critico");
  assert.equal(items[1].dias, 1);
  assert.equal(items[1].severidad, "atrasado");
});

// --- resumen ---

test("el resumen cuenta críticos, estatus, atraso máximo y monto detenido", () => {
  const items = auditarPendientes(
    [
      pedido({ id: "a", fecha: "2026-08-05", total: 1000 }),
      pedido({ id: "b", fecha: "2026-08-14", estatus: "asignado", total: 500 }),
      pedido({ id: "c", fecha: "2026-08-14", total: null }),
    ],
    HOY,
  );
  const r = resumenAuditoria(items);
  assert.equal(r.total, 3);
  assert.equal(r.criticos, 1);
  assert.equal(r.enRuta, 2);
  assert.equal(r.asignados, 1);
  assert.equal(r.diasMax, 10);
  assert.equal(r.montoDetenido, 1500);
});

// --- agrupación por chofer ---

const conChofer = (id, nombre, fecha, telefono = null) =>
  pedido({ id: `p-${id}-${fecha}`, fecha, chofer: { id, nombre, telefono } });

test("agrupa por chofer y ordena por atraso máximo", () => {
  const items = auditarPendientes(
    [
      conChofer("c1", "Aníbal Rojas", "2026-08-14"),
      conChofer("c2", "Gonzalo Pérez", "2026-08-05"),
      conChofer("c2", "Gonzalo Pérez", "2026-08-13"),
    ],
    HOY,
  );
  const grupos = agruparPorChofer(items);
  assert.deepEqual(grupos.map((g) => g.nombre), ["Gonzalo Pérez", "Aníbal Rojas"]);
  assert.equal(grupos[0].pedidos, 2);
  assert.equal(grupos[0].diasMax, 10);
  assert.equal(grupos[1].pedidos, 1);
});

test("los pedidos sin chofer caen en un grupo 'Sin asignar'", () => {
  const items = auditarPendientes([pedido({ chofer: null })], HOY);
  const [g] = agruparPorChofer(items);
  assert.equal(g.chofer_id, null);
  assert.equal(g.nombre, "Sin asignar");
  assert.equal(g.telefono, null);
});

// --- teléfonos y WhatsApp ---

test("gana el teléfono capturado en la ficha del chofer", () => {
  assert.equal(telefonoChofer("Aníbal Rojas", "624 111 2233"), "624 111 2233");
});

test("sin teléfono en la ficha se usa el respaldo por nombre (con o sin acento)", () => {
  assert.equal(telefonoChofer("Aníbal Rojas", null), "6243158521");
  assert.equal(telefonoChofer("ANIBAL", ""), "6243158521");
  assert.equal(telefonoChofer("Gonzalo Pérez", null), "6242104491");
  assert.equal(telefonoChofer("Martín Sánchez", null), "3331420073");
});

test("un chofer desconocido sin teléfono se queda sin número", () => {
  assert.equal(telefonoChofer("Ramón Torres", null), null);
});

test("un teléfono incompleto en la ficha cae al respaldo", () => {
  assert.equal(telefonoChofer("Gonzalo Pérez", "12345"), "6242104491");
});

test("normaliza el número mexicano a formato wa.me", () => {
  assert.equal(numeroWhatsapp("6243158521"), "526243158521");
  assert.equal(numeroWhatsapp("624 210 4491"), "526242104491");
  assert.equal(numeroWhatsapp("+52 624 315 8521"), "526243158521");
  assert.equal(numeroWhatsapp("521 624 315 8521"), "526243158521");
  assert.equal(numeroWhatsapp(null), null);
  assert.equal(numeroWhatsapp("sin número"), null);
});

test("linkWhatsapp arma el enlace con el mensaje codificado, o null sin número", () => {
  const url = linkWhatsapp("6243158521", "hola mundo");
  assert.equal(url, "https://wa.me/526243158521?text=hola%20mundo");
  assert.equal(linkWhatsapp(null, "hola"), null);
});

// --- mensaje ---

test("el recordatorio nombra los folios y pide firma y sello", () => {
  const msg = mensajeRecordatorio("Aníbal Rojas", [
    { numero_factura: "A-1234", fecha: "2026-08-05", dias: 10, cliente: "Hotel Ejemplo" },
  ]);
  assert.match(msg, /Hola Aníbal/);
  assert.match(msg, /1 pedido que sigue marcado/);
  assert.match(msg, /A-1234 — Hotel Ejemplo \(del 2026-08-05, 10 días\)/);
  assert.match(msg, /FIRMA y el SELLO/);
});

test("el recordatorio se pluraliza con varios folios", () => {
  const msg = mensajeRecordatorio("Martín", [
    { numero_factura: "A-1", fecha: "2026-08-13", dias: 2, cliente: null },
    { numero_factura: "A-2", fecha: "2026-08-14", dias: 1, cliente: "Cliente Dos" },
  ]);
  assert.match(msg, /2 pedidos que siguen marcados/);
  assert.match(msg, /A-1 — cliente s\/n \(del 2026-08-13, 2 días\)/);
  assert.match(msg, /A-2 — Cliente Dos \(del 2026-08-14, 1 día\)/);
});
