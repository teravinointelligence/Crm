// Parser de CFDI 4.0/3.3 emitido por TERAVINO. Extrae los campos necesarios
// para crear un pedido de reparto (folio, total, IVA, receptor, partidas).

import { XMLParser } from "fast-xml-parser";

export type CfdiPartida = {
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  clave_unidad: string | null;
  clave_sat: string | null;
  no_identificacion: string | null;
  valor_unitario: number;
  importe: number;
  descuento: number;
};

export type CfdiParsed = {
  uuid: string | null;
  serie: string | null;
  folio: string | null;
  numero_factura: string; // serie+folio o solo folio
  fecha: string; // yyyy-mm-dd
  subtotal: number;
  total: number;
  iva: number;
  moneda: string;
  metodo_pago: string | null;
  forma_pago: string | null;
  receptor: {
    nombre: string | null;
    rfc: string | null;
    codigo_postal: string | null;
    uso_cfdi: string | null;
    regimen: string | null;
  };
  emisor: {
    nombre: string | null;
    rfc: string | null;
  };
  partidas: CfdiPartida[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true, // normaliza cfdi: y tfd: a llave plana
  parseAttributeValue: false,
  trimValues: true,
});

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toArray<T>(x: T | T[] | undefined): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

export function parseCfdi(xml: string): CfdiParsed {
  const doc = parser.parse(xml);
  const c = doc?.Comprobante;
  if (!c) throw new Error("XML inválido: no se encontró cfdi:Comprobante.");

  const emisor = c.Emisor ?? {};
  const receptor = c.Receptor ?? {};
  const conceptosRoot = c.Conceptos ?? {};
  const conceptos = toArray<Record<string, unknown>>(conceptosRoot.Concepto);
  const impuestosRoot = c.Impuestos ?? {};
  const tfd = c.Complemento?.TimbreFiscalDigital ?? {};

  const serie = (c["@_Serie"] ?? "").toString().trim() || null;
  const folio = (c["@_Folio"] ?? "").toString().trim() || null;
  if (!folio) throw new Error("XML sin Folio.");
  const numero_factura = `${serie ?? ""}${folio}`;

  const fechaRaw = (c["@_Fecha"] ?? "").toString();
  const fecha = fechaRaw ? fechaRaw.slice(0, 10) : "";
  if (!fecha) throw new Error("XML sin Fecha.");

  const subtotal = num(c["@_SubTotal"]);
  const total = num(c["@_Total"]);
  const iva = num((impuestosRoot["@_TotalImpuestosTrasladados"] ?? "")) || Math.max(0, total - subtotal);
  const moneda = (c["@_Moneda"] ?? "MXN").toString();

  const partidas: CfdiPartida[] = conceptos.map((p) => ({
    descripcion: String(p["@_Descripcion"] ?? "").trim(),
    cantidad: num(p["@_Cantidad"]),
    unidad: (p["@_Unidad"] ?? "").toString().trim() || null,
    clave_unidad: (p["@_ClaveUnidad"] ?? "").toString().trim() || null,
    clave_sat: (p["@_ClaveProdServ"] ?? "").toString().trim() || null,
    no_identificacion: (p["@_NoIdentificacion"] ?? "").toString().trim() || null,
    valor_unitario: num(p["@_ValorUnitario"]),
    importe: num(p["@_Importe"]),
    descuento: num(p["@_Descuento"]),
  }));

  return {
    uuid: ((tfd["@_UUID"] ?? "").toString().trim() || null)?.toUpperCase() ?? null,
    serie,
    folio,
    numero_factura,
    fecha,
    subtotal,
    total,
    iva,
    moneda,
    metodo_pago: (c["@_MetodoPago"] ?? "").toString().trim() || null,
    forma_pago: (c["@_FormaPago"] ?? "").toString().trim() || null,
    receptor: {
      nombre: (receptor["@_Nombre"] ?? "").toString().trim() || null,
      rfc: ((receptor["@_Rfc"] ?? "").toString().trim() || null)?.toUpperCase() ?? null,
      codigo_postal: (receptor["@_DomicilioFiscalReceptor"] ?? "").toString().trim() || null,
      uso_cfdi: (receptor["@_UsoCFDI"] ?? "").toString().trim() || null,
      regimen: (receptor["@_RegimenFiscalReceptor"] ?? "").toString().trim() || null,
    },
    emisor: {
      nombre: (emisor["@_Nombre"] ?? "").toString().trim() || null,
      rfc: ((emisor["@_Rfc"] ?? "").toString().trim() || null)?.toUpperCase() ?? null,
    },
    partidas,
  };
}
