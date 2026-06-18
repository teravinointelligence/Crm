import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { PromocionCard } from "@/components/promociones/PromocionCard";
import { PromocionesHeader } from "@/components/promociones/PromocionesHeader";
import type { PromoRow } from "@/components/promociones/PromocionForm";

export const dynamic = "force-dynamic";

export default async function PromocionesPage() {
  const supabase = createClient();
  const me = await getCurrentRep();
  if (!me) redirect("/login");

  const isAdmin = me.role === "admin";
  // Enviar promociones a clientes: solo admin y vendedores (rep).
  const canSend = me.role === "admin" || me.role === "rep";

  const [{ data: rawPromos }, { data: products }] = await Promise.all([
    supabase
      .from("promotions")
      .select("*, product:product_id(name)")
      .order("active", { ascending: false })
      .order("valid_from", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("products")
      .select("id, name, supplier")
      .eq("active", true)
      .order("supplier")
      .order("name"),
  ]);

  const promos: PromoRow[] = (rawPromos ?? []).map((p: any) => ({
    id: p.id,
    title: p.title,
    product_id: p.product_id,
    product_name: p.product?.name ?? null,
    promo_type: p.promo_type,
    description: p.description,
    discount_pct: p.discount_pct,
    bonus_qty: p.bonus_qty,
    bonus_per: p.bonus_per,
    valid_from: p.valid_from,
    valid_to: p.valid_to,
    active: p.active,
    created_at: p.created_at,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const vigentes = promos.filter(
    (p) => p.active && (!p.valid_to || p.valid_to >= today) && (!p.valid_from || p.valid_from <= today),
  );
  const proximas = promos.filter((p) => p.active && p.valid_from && p.valid_from > today);
  const vencidas = promos.filter(
    (p) => !p.active || (p.valid_to != null && p.valid_to < today),
  );

  const productList = (products ?? []) as { id: string; name: string; supplier: string | null }[];

  return (
    <div className="space-y-8">
      <PromocionesHeader isAdmin={isAdmin} products={productList} repId={me.id} />

      {promos.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Sin promociones"
          description={
            isAdmin
              ? "Crea la primera promoción con el botón de arriba."
              : "El equipo de administración publicará las promociones aquí."
          }
        />
      ) : (
        <>
          {vigentes.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg">Vigentes</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {vigentes.map((p) => (
                  <PromocionCard key={p.id} promo={p} isAdmin={isAdmin} canSend={canSend} products={productList} repId={me.id} />
                ))}
              </div>
            </section>
          )}

          {proximas.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg text-muted-foreground">Próximas</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {proximas.map((p) => (
                  <PromocionCard key={p.id} promo={p} isAdmin={isAdmin} canSend={canSend} products={productList} repId={me.id} />
                ))}
              </div>
            </section>
          )}

          {vencidas.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg text-muted-foreground">Vencidas / inactivas</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {vencidas.map((p) => (
                  <PromocionCard key={p.id} promo={p} isAdmin={isAdmin} canSend={canSend} products={productList} repId={me.id} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
