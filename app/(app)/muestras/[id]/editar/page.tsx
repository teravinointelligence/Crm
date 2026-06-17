import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SampleEditForm } from "@/components/samples/SampleEditForm";

export default async function SampleEditPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  const isAdmin = rep.role === "admin";

  const { data: req } = await supabase
    .from("sample_requests")
    .select("*, sample_request_items(id, product_id, product_name, supplier, quantity, notes)")
    .eq("id", params.id)
    .single();

  if (!req) notFound();

  // Solo se puede editar en borrador (y enviada por admin)
  const canEdit =
    (req.status === "borrador" && (isAdmin || req.sales_rep_id === rep.id)) ||
    (["enviada", "aprobada"].includes(req.status ?? "") && isAdmin);

  if (!canEdit) redirect(`/muestras/${params.id}`);

  const { data: products } = await supabase
    .from("products")
    .select("id, name, supplier, varietal, vintage, active")
    .eq("active", true)
    .order("name");

  const items = (req.sample_request_items ?? []) as Array<{
    id: string;
    product_id: string | null;
    product_name: string;
    supplier: string | null;
    quantity: number;
    notes: string | null;
  }>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/muestras/${params.id}`}><ArrowLeft className="mr-1 h-4 w-4" /> Volver</Link>
      </Button>

      <div className="rounded-lg border bg-card p-6 brand-shadow">
        <h1 className="font-display text-3xl">Editar solicitud</h1>
        <p className="mt-1 text-sm text-muted-foreground">{req.request_number} · estado: {req.status}</p>
      </div>

      <SampleEditForm
        requestId={params.id}
        initialStatus={req.status ?? "borrador"}
        initialItems={items}
        initialReason={req.reason ?? null}
        initialNotes={req.notes ?? null}
        initialShipToClient={req.ship_to_client ?? false}
        initialShipDate={req.ship_date ?? null}
        initialTrainingPeople={req.training_people ?? null}
        products={products ?? []}
      />
    </div>
  );
}
