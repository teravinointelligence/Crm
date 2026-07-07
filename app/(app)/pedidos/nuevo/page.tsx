import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { OrderForm } from "@/components/orders/OrderForm";
import { warehouseForRegion } from "@/lib/warehouses";

export const metadata = { title: "Nueva cotización — TERAVINO CRM" };

export default async function NuevoPedidoPage({
  searchParams,
}: {
  searchParams: { account?: string };
}) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  const [{ data: accounts }, { data: products }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, business_name, region, price_tier, fiscal_name, client_number")
      .order("business_name"),
    supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("supplier")
      .order("name"),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Nueva cotización</h1>
        <p className="text-sm text-muted-foreground">
          Selecciona el cliente y se aplicará el precio según su región.
        </p>
      </div>
      <OrderForm
        accounts={accounts ?? []}
        products={products ?? []}
        repId={rep.id}
        isAdmin={rep.role === "admin"}
        defaultAccountId={searchParams.account}
        defaultWarehouse={warehouseForRegion(rep.primary_region)}
      />
    </div>
  );
}
