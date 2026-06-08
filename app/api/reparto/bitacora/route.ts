// GET /api/reparto/bitacora — entregas con filtros (chofer, fechas, texto).
//   ?format=xlsx → descarga el listado como Excel.

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { requireReparto } from "../_lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EntregaRow = {
  id: string;
  timestamp_entrega: string | null;
  foto_url: string | null;
  compartido_whatsapp: boolean | null;
  observaciones: string | null;
  chofer_id: string | null;
  pedido_id: string;
  pedidos: {
    id: string;
    numero_factura: string;
    fecha: string;
    total: number | null;
    direccion_entrega: string | null;
    estatus: string;
    cliente: { id: string; nombre: string; rfc: string | null; ciudad: string | null; zona: string | null } | null;
  } | null;
  chofer: { id: string; nombre: string; email: string } | null;
};

async function fetchEntregas(searchParams: URLSearchParams) {
  const chofer = searchParams.get("chofer_id");
  const from = searchParams.get("fecha_from");
  const to = searchParams.get("fecha_to");
  const q = searchParams.get("q")?.trim() ?? "";

  let query = repartoAdmin
    .from("entregas")
    .select(
      "id, timestamp_entrega, foto_url, compartido_whatsapp, observaciones, chofer_id, pedido_id, pedidos:pedido_id(id, numero_factura, fecha, total, direccion_entrega, estatus, cliente:cliente_id(id, nombre, rfc, ciudad, zona)), chofer:chofer_id(id, nombre, email)",
    )
    .order("timestamp_entrega", { ascending: false })
    .limit(500);

  if (chofer && chofer !== "todos") query = query.eq("chofer_id", chofer);
  if (from) query = query.gte("timestamp_entrega", `${from}T00:00:00`);
  if (to) query = query.lte("timestamp_entrega", `${to}T23:59:59`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as unknown as EntregaRow[];
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) =>
      [
        r.pedidos?.numero_factura,
        r.pedidos?.cliente?.nombre,
        r.pedidos?.cliente?.rfc,
        r.chofer?.nombre,
      ]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(needle)),
    );
  }
  return rows;
}

export async function GET(req: Request) {
  const { response } = await requireReparto();
  if (response) return response;
  const { searchParams } = new URL(req.url);

  try {
    const rows = await fetchEntregas(searchParams);
    if (searchParams.get("format") === "xlsx") {
      const sheet = XLSX.utils.json_to_sheet(
        rows.map((r) => ({
          Fecha: r.timestamp_entrega ? new Date(r.timestamp_entrega).toISOString().slice(0, 10) : "",
          Hora: r.timestamp_entrega ? new Date(r.timestamp_entrega).toISOString().slice(11, 16) : "",
          Folio: r.pedidos?.numero_factura ?? "",
          Cliente: r.pedidos?.cliente?.nombre ?? "",
          RFC: r.pedidos?.cliente?.rfc ?? "",
          Zona: r.pedidos?.cliente?.zona ?? r.pedidos?.cliente?.ciudad ?? "",
          Direccion: r.pedidos?.direccion_entrega ?? "",
          Chofer: r.chofer?.nombre ?? "",
          Estatus: r.pedidos?.estatus ?? "",
          Total: r.pedidos?.total ?? "",
          WhatsApp: r.compartido_whatsapp ? "Sí" : "",
          Foto: r.foto_url ?? "",
          Observaciones: r.observaciones ?? "",
        })),
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, "Bitácora");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const today = new Date().toISOString().slice(0, 10);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="bitacora-${today}.xlsx"`,
        },
      });
    }
    return NextResponse.json({ data: rows, count: rows.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
