import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { effectiveModules, isRepartoOnlyRole } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { Fab } from "@/components/layout/Fab";
import { PresenceHeartbeat } from "@/components/layout/PresenceHeartbeat";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  const isAdmin = rep.role === "admin";
  const repartoOnly = isRepartoOnlyRole(rep.role);
  const modules = isAdmin ? [] : effectiveModules(rep.modules);

  // Indicador de "muestras por revisar" (solicitudes enviadas) para admins.
  let badges: Record<string, number> = {};
  if (isAdmin) {
    const supabase = createClient();
    const { count } = await supabase
      .from("sample_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "enviada");
    if (count) badges = { "/muestras": count };
  }

  return (
    <div className="flex min-h-screen">
      <PresenceHeartbeat />
      <Sidebar isAdmin={isAdmin} modules={modules} badges={badges} role={rep.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header rep={rep} isAdmin={isAdmin} modules={modules} badges={badges} />
        {/* pb-36 en móvil: deja libre la franja del FAB (bottom-16 + h-14 ≈ 120px)
            para que la última fila de las listas no quede tapada. */}
        <main className="flex-1 px-4 pb-36 pt-6 lg:px-8 lg:pb-8">
          {children}
        </main>
        {!repartoOnly && <Fab />}
        <BottomNav isAdmin={isAdmin} role={rep.role} />
      </div>
    </div>
  );
}
