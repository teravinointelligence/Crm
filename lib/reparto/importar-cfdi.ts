import "server-only";

import { repartoAdmin } from "@/lib/supabase-reparto";
import {
  parseCfdi,
  validarCfdiVentaTeravino,
  type CfdiParsed,
} from "@/lib/cfdi/parse";
import {
  crearResolvedorAsignacionAutomatica,
  type AsignacionAutomatica,
} from "@/lib/reparto/asignacion-automatica-server";

export type OrigenImportacionCfdi = "xml_upload" | "email_xml";

export type ResultadoImportacionCfdi = {
  archivo: string;
  status: "creado" | "ya_existe" | "error";
  pedido_id?: string;
  numero_factura?: string;
  error?: string;
  asignacion?: {
    aplicada: boolean;
    chofer_nombre: string | null;
    motivo: string;
  };
  cliente_creado?: boolean;
};

type ClienteAsignable = {
  id: string;
  created: boolean;
  rfc: string | null;
  ciudad: string | null;
  zona: string | null;
};

type ResolvedorAsignacion = ReturnType<typeof crearResolvedorAsignacionAutomatica>;

async function ensureCliente(parsed: CfdiParsed): Promise<ClienteAsignable | null> {
  const rfc = parsed.receptor.rfc;
  if (rfc) {
    const { data } = await repartoAdmin
      .from("clientes")
      .select("id, rfc, ciudad, zona")
      .ilike("rfc", rfc)
      .limit(1)
      .maybeSingle();
    if (data?.id) return { ...data, rfc: data.rfc ?? rfc, created: false };
  }

  if (parsed.receptor.nombre) {
    const { data } = await repartoAdmin
      .from("clientes")
      .select("id, rfc, ciudad, zona")
      .ilike("nombre", parsed.receptor.nombre)
      .limit(1)
      .maybeSingle();
    if (data?.id) return { ...data, rfc: data.rfc ?? rfc ?? null, created: false };
  }

  if (!parsed.receptor.nombre || !rfc) return null;
  const { data: nuevo, error } = await repartoAdmin
    .from("clientes")
    .insert({
      rfc,
      nombre: parsed.receptor.nombre,
      notas: parsed.receptor.codigo_postal
        ? `CP fiscal: ${parsed.receptor.codigo_postal}`
        : null,
    })
    .select("id, rfc, ciudad, zona")
    .single();
  if (error || !nuevo) return null;
  return { ...nuevo, created: true };
}

function resultadoAsignacion(asignacion: AsignacionAutomatica) {
  return {
    aplicada: asignacion.aplicada,
    chofer_nombre: asignacion.chofer_nombre,
    motivo: asignacion.motivo,
  };
}

export async function importarCfdiXml({
  archivo,
  xml,
  origen,
  validarVentaTeravino = false,
  asignador = crearResolvedorAsignacionAutomatica(),
}: {
  archivo: string;
  xml: string;
  origen: OrigenImportacionCfdi;
  validarVentaTeravino?: boolean;
  asignador?: ResolvedorAsignacion;
}): Promise<ResultadoImportacionCfdi> {
  let parsed: CfdiParsed;
  try {
    parsed = parseCfdi(xml);
    if (validarVentaTeravino) validarCfdiVentaTeravino(parsed);
  } catch (error) {
    return {
      archivo,
      status: "error",
      error: error instanceof Error ? error.message : "XML inválido",
    };
  }

  if (parsed.uuid) {
    const { data: existente } = await repartoAdmin
      .from("pedidos")
      .select("id")
      .eq("uuid_fiscal", parsed.uuid)
      .maybeSingle();
    if (existente?.id) {
      return {
        archivo,
        status: "ya_existe",
        pedido_id: existente.id,
        numero_factura: parsed.numero_factura,
      };
    }
  }

  const cliente = await ensureCliente(parsed);
  if (!cliente) {
    return {
      archivo,
      status: "error",
      numero_factura: parsed.numero_factura,
      error: "No pude identificar o crear el cliente.",
    };
  }

  const asignacion = await asignador.resolver(cliente);
  const { data: pedido, error: pedidoError } = await repartoAdmin
    .from("pedidos")
    .insert({
      numero_factura: parsed.numero_factura,
      uuid_fiscal: parsed.uuid,
      cliente_id: cliente.id,
      fecha: parsed.fecha,
      subtotal: parsed.subtotal,
      iva: parsed.iva,
      total: parsed.total,
      moneda: parsed.moneda,
      chofer_id: asignacion.chofer_id,
      estatus: asignacion.aplicada ? "asignado" : "pendiente_asignar",
      prioridad: "normal",
      origen,
    })
    .select("id")
    .single();

  if (pedidoError || !pedido) {
    if (pedidoError?.code === "23505" && parsed.uuid) {
      const { data: existente } = await repartoAdmin
        .from("pedidos")
        .select("id")
        .eq("uuid_fiscal", parsed.uuid)
        .maybeSingle();
      return {
        archivo,
        status: "ya_existe",
        pedido_id: existente?.id,
        numero_factura: parsed.numero_factura,
      };
    }
    return {
      archivo,
      status: "error",
      numero_factura: parsed.numero_factura,
      error: pedidoError?.message ?? "No se pudo crear el pedido.",
    };
  }

  if (parsed.partidas.length) {
    const partidas = parsed.partidas.map((partida) => ({
      pedido_id: pedido.id,
      descripcion: partida.descripcion,
      cantidad: partida.cantidad,
      unidad: partida.unidad,
      clave_sat: partida.clave_sat,
      valor_unitario: partida.valor_unitario,
      importe:
        partida.importe ||
        Math.round(partida.cantidad * partida.valor_unitario * 100) / 100,
      descuento: partida.descuento,
    }));
    const { error: partidasError } = await repartoAdmin
      .from("pedido_productos")
      .insert(partidas);

    if (partidasError) {
      const { error: rollbackError } = await repartoAdmin
        .from("pedidos")
        .delete()
        .eq("id", pedido.id);
      return {
        archivo,
        status: "error",
        numero_factura: parsed.numero_factura,
        error: rollbackError
          ? `No se guardaron las partidas y no se pudo revertir el pedido: ${partidasError.message}`
          : `No se guardaron las partidas: ${partidasError.message}`,
      };
    }
  }

  return {
    archivo,
    status: "creado",
    pedido_id: pedido.id,
    numero_factura: parsed.numero_factura,
    asignacion: resultadoAsignacion(asignacion),
    cliente_creado: cliente.created,
  };
}
