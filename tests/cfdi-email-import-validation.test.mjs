import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCfdi,
  validarCfdiVentaTeravino,
} from "../lib/cfdi/parse.ts";

function xml({ rfc = "TER170509L72", tipo = "I", uuid = "A1111111-B222-C333-D444-E55555555555" } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="FA" Folio="15593" Fecha="2026-09-02T09:00:00" SubTotal="100.00" Total="116.00" Moneda="MXN" TipoDeComprobante="${tipo}">
    <cfdi:Emisor Rfc="${rfc}" Nombre="TERAVINO" />
    <cfdi:Receptor Rfc="XAXX010101000" Nombre="CLIENTE PRUEBA" DomicilioFiscalReceptor="23000" UsoCFDI="G03" RegimenFiscalReceptor="616" />
    <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="50202203" Cantidad="1" Unidad="Pieza" Descripcion="Vino" ValorUnitario="100.00" Importe="100.00" /></cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="16.00" />
    <cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${uuid}" /></cfdi:Complemento>
  </cfdi:Comprobante>`;
}

test("acepta un CFDI de ingreso emitido por TERAVINO", () => {
  const parsed = parseCfdi(xml());
  assert.equal(parsed.tipo_comprobante, "I");
  assert.doesNotThrow(() => validarCfdiVentaTeravino(parsed));
});

test("rechaza XML de proveedores", () => {
  const parsed = parseCfdi(xml({ rfc: "BWI211104V10" }));
  assert.throws(() => validarCfdiVentaTeravino(parsed), /no fue emitido por TERAVINO/);
});

test("rechaza egresos y XML sin UUID", () => {
  assert.throws(
    () => validarCfdiVentaTeravino(parseCfdi(xml({ tipo: "E" }))),
    /no es un CFDI de ingreso/,
  );
  assert.throws(
    () => validarCfdiVentaTeravino(parseCfdi(xml({ uuid: "" }))),
    /no contiene UUID fiscal/,
  );
});
