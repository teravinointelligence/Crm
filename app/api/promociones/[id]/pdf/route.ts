// GET /api/promociones/[id]/pdf — descarga el flyer (PDF) de una promoción con
// el membrete TERAVINO, para enviar/compartir con clientes.

import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { PromoFlyerPdf, type PromoFlyerData } from "@/components/promociones/PromoFlyerPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return new Response("No autenticado", { status: 401 });

  const supabase = createClient();
  const { data: p } = await supabase
    .from("promotions")
    .select("*, product:product_id(name)")
    .eq("id", params.id)
    .maybeSingle();

  if (!p) return new Response("Promoción no encontrada", { status: 404 });

  const promo: PromoFlyerData = {
    title: p.title,
    product_name: (p as { product?: { name?: string } | null }).product?.name ?? null,
    promo_type: p.promo_type,
    description: p.description,
    discount_pct: p.discount_pct,
    bonus_qty: p.bonus_qty,
    bonus_per: p.bonus_per,
    valid_from: p.valid_from,
    valid_to: p.valid_to,
  };

  const buffer = await renderToBuffer(PromoFlyerPdf({ promo }));
  const slug = (p.title as string)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50) || "promocion";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
