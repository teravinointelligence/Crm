import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { ActivityViewTabs } from "@/components/activities/ActivityViewTabs";
import type { Activity } from "@/types/database";

export const metadata = { title: "Actividades — TERAVINO CRM" };

export default async function ActividadesPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, accounts:account_id(business_name)")
    .order("activity_date", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Actividades</h1>
          <p className="text-sm text-muted-foreground">
            Visitas, llamadas, degustaciones y eventos.
          </p>
        </div>
        <Button asChild>
          <Link href="/actividades/nueva">
            <Plus className="mr-1 h-4 w-4" /> Nueva actividad
          </Link>
        </Button>
      </div>
      <ActivityViewTabs />
      <ActivityTimeline
        activities={(data ?? []) as Activity[]}
        showAccount
      />
    </div>
  );
}
