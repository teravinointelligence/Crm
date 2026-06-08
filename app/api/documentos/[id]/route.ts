// PATCH /api/documentos/[id] — cambia el estado de un documento generado
// (borrador → finalizado → enviado) en Teravino Docs.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
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
