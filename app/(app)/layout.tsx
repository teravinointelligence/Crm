import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { effectiveModules, isRepartoOnlyRole, isSellerRole } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { Fab } from "@/components/layout/Fab";
import { PresenceHeartbeat } from "@/components/layout/PresenceHeartbeat";
import { PersonalIncentiveAnnouncement } from "@/components/incentivos/PersonalIncentiveAnnouncement";
import { getPersonalIncentiveConfig } from "@/lib/personal-incentives";
import { TomasPendientesPopup } from "@/components/consignaciones/TomasPendientesPopup";
import { loadTomasGroups, type VendedorTomasGroup } from "@/lib/tomas-inventario-email";
import { resolveCrmAccountId, selectTomasGroupsForRep } from "@/lib/tomas-inventario-popup";
import {
  CreditosLiberadosPopup,
  type CreditoLiberadoPopupItem,
} from "@/components/cartera/CreditosLiberadosPopup";

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
  const personalIncentive = getPersonalIncentiveConfig(rep.email);
  const isIsai = rep.email.trim().toLowerCase() === "isai@teravino.com";

  let creditosLiberados: CreditoLiberadoPopupItem[] = [];
  if (isSellerRole(rep.role) || isIsai) {
    const db = isIsai ? supabaseAdmin() : createClient();
    const [{ data: balances }, { data: reps }, { data: creditAccounts }] = await Promise.all([
      db
        .from("v_account_balance")
        .select("account_id, business_name, assigned_rep_id, total_pagado")
        .gt("total_pagado", 0)
        .order("business_name"),
      isIsai
        ? db.from("sales_reps").select("id, full_name")
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      db.from("accounts").select("id, client_number"),
    ]);
    const repNames = new Map(
      ((reps ?? []) as { id: string; full_name: string | null }[]).map((seller) => [
        seller.id,
        seller.full_name,
      ]),
    );
    const clientNumbers = new Map(
      (creditAccounts ?? []).map((account) => [account.id, account.client_number]),
    );
    creditosLiberados = (balances ?? [])
      .filter((balance) => isIsai || balance.assigned_rep_id === rep.id)
      .map((balance) => ({
        accountId: balance.account_id,
        nombre: balance.business_name ?? "Cuenta sin nombre",
        clientNumber: clientNumbers.get(balance.account_id) ?? null,
        vendedor: balance.assigned_rep_id
          ? repNames.get(balance.assigned_rep_id) ?? null
          : null,
      }));
  }

  // Base44 es la fuente de verdad de consignaciones y tomas. Si la integración
  // está temporalmente indisponible, el CRM sigue cargando sin bloquear al usuario.
  let tomaGroups: VendedorTomasGroup[] = [];
  if (!repartoOnly) {
    try {
      const allGroups = await loadTomasGroups();
      tomaGroups = selectTomasGroupsForRep(allGroups, rep.email, isAdmin);
      const supabase = createClient();
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, business_name, client_number");
      const crmAccounts = accounts ?? [];
      tomaGroups = tomaGroups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          accountId: resolveCrmAccountId(item, crmAccounts),
        })),
      }));
    } catch (error) {
      console.error("No se pudieron cargar las tomas pendientes desde Base44", error);
    }
  }

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
      {personalIncentive && <PersonalIncentiveAnnouncement config={personalIncentive} />}
      <CreditosLiberadosPopup
        items={creditosLiberados}
        repKey={rep.id}
        facturista={isIsai}
      />
      <TomasPendientesPopup
        groups={tomaGroups}
        isAdmin={isAdmin}
        repName={rep.full_name ?? rep.email}
        repKey={rep.id}
      />
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
