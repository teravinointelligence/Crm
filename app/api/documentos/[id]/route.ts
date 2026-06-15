// PATCH /api/documentos/[id] — cambia el estado de un documento generado
// (borrador → finalizado → enviado) en Teravino Docs.
// DELETE /api/documentos/[id] — borra un documento generado, solo si sigue en
// borrador (los finalizados/enviados no se borran) y lo pide su autor o un admin.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { base44Docs, type Base44GeneratedDoc, type DocStatus } from "@/lib/base44-docs";

const VALID: DocStatus[] = ["borrador", "finalizado", "enviado"];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { status?: string };
  try {
    body = (await req.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Body inválido (JSON)" }, { status: 400 });
  }
  const status = body.status as DocStatus | undefined;
  if (!status || !VALID.includes(status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  try {
    await base44Docs.entity<Base44GeneratedDoc>("GeneratedDocument").update(params.id, { status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al actualizar" },
      { status: 502 },
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const docs = base44Docs.entity<Base44GeneratedDoc>("GeneratedDocument");

  // Validamos sobre el documento real: que exista, que el usuario tenga derecho
  // a borrarlo (autor o admin) y que siga en borrador.
  let doc: Base44GeneratedDoc;
  try {
    doc = await docs.get(params.id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se encontró el documento" },
      { status: 404 },
    );
  }

  const isAdmin = canAccessFacturacion(rep.role);
  if (!isAdmin && doc.crm_rep_email !== rep.email) {
    return NextResponse.json({ error: "No puedes borrar este documento" }, { status: 403 });
  }

  const status = doc.status ?? "borrador";
  if (status !== "borrador") {
    return NextResponse.json(
      { error: "Solo se pueden borrar documentos en borrador" },
      { status: 409 },
    );
  }

  try {
    await docs.delete(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al borrar" },
      { status: 502 },
    );
  }
}
