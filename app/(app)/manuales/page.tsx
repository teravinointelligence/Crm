// Manuales / SOPs — vista de solo lectura en cards, agrupadas por categoría.
// Al abrir uno se embebe el preview de Google Drive (sin descarga).

import Link from "next/link";
import { BookOpen, FileText, FileType } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Sop } from "@/types/database";

export const metadata = { title: "Manuales — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function ManualesPage() {
  await requireRep();
  const supabase = createClient();
  const { data } = await supabase
    .from("sops")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const sops = (data ?? []) as Sop[];

  // Agrupar por categoría preservando el orden.
  const groups = new Map<string, Sop[]>();
  for (const s of sops) {
    const cat = s.category ?? "General";
    const arr = groups.get(cat) ?? [];
    arr.push(s);
    groups.set(cat, arr);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Manuales de operación</h1>
        <p className="text-sm text-muted-foreground">
          SOPs de TERAVINO — solo lectura. Da clic en un manual para verlo.
        </p>
      </div>

      {sops.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Sin manuales"
          description="Aún no hay SOPs registrados."
        />
      ) : (
        <div className="space-y-8">
          {Array.from(groups.entries()).map(([cat, items]) => (
            <div key={cat} className="space-y-3">
              <h2 className="font-display text-lg text-muted-foreground">{cat}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => {
                  const Icon = s.file_kind === "doc" ? FileType : FileText;
                  return (
                    <Link key={s.id} href={`/manuales/${s.id}`}>
                      <Card className="h-full transition hover:border-brand-carmesi">
                        <CardContent className="flex items-start gap-3 p-4">
                          <div className="rounded-md bg-accent/20 p-2 text-brand-carmesi">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium leading-snug">{s.title}</p>
                            <Badge variant="muted" className="mt-1.5 text-[10px] uppercase">
                              {s.file_kind === "doc" ? "Documento" : "PDF"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
