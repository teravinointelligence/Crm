// POST /api/inbound/reparto-cfdi — entrada privada para la automatización
// Outlook → Make → CRM. Solo acepta CFDI de ingreso emitidos por TERAVINO.

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { importarCfdiXml } from "@/lib/reparto/importar-cfdi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_XML_BYTES = 1_000_000;
// Solo se publica el hash. El token original vive únicamente en Make.
const TOKEN_SHA256 = "b0393504103c81a603fb318a8cf8ed968db3317afdac7f5df01b851cd6775088";

function autorizado(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const recibido = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const recibidoHash = crypto.createHash("sha256").update(recibido).digest();
  const esperadoHash = Buffer.from(TOKEN_SHA256, "hex");
  return crypto.timingSafeEqual(recibidoHash, esperadoHash);
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const entrada = form.get("file");
    if (entrada instanceof File) file = entrada;
  } catch {
    return NextResponse.json(
      { ok: false, error: "No se pudo leer el archivo." },
      { status: 400 },
    );
  }

  if (!file || !file.name.toLowerCase().endsWith(".xml")) {
    return NextResponse.json(
      { ok: false, error: "Se requiere un archivo XML." },
      { status: 400 },
    );
  }
  if (file.size > MAX_XML_BYTES) {
    return NextResponse.json(
      { ok: false, error: "El XML excede el límite permitido." },
      { status: 413 },
    );
  }

  const resultado = await importarCfdiXml({
    archivo: file.name,
    xml: await file.text(),
    origen: "email_xml",
    validarVentaTeravino: true,
  });

  if (resultado.status === "error") {
    return NextResponse.json({ ok: false, resultado }, { status: 422 });
  }

  return NextResponse.json(
    { ok: true, resultado },
    { status: resultado.status === "creado" ? 201 : 200 },
  );
}
