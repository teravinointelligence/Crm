"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { initials } from "@/lib/utils";
import { ROLE_LABEL, type UserRole, isValidRole } from "@/lib/modules";

export type TeamMember = {
  id: string;
  full_name: string;
  primary_region: string | null;
  role: string | null;
  last_seen_at: string | null;
};

const ONLINE_MS = 5 * 60_000; // activo en los últimos 5 min = en línea

function isOnline(lastSeen: string | null, now: number): boolean {
  if (!lastSeen) return false;
  return now - new Date(lastSeen).getTime() < ONLINE_MS;
}

function relative(lastSeen: string | null, now: number): string {
  if (!lastSeen) return "Sin conexión aún";
  const diff = now - new Date(lastSeen).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Hace un momento";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Ayer" : `Hace ${d} días`;
}

function roleLabel(role: string | null): string {
  return role && isValidRole(role) ? ROLE_LABEL[role as UserRole] : "—";
}

function sortMembers(list: TeamMember[], now: number): TeamMember[] {
  return [...list].sort((a, b) => {
    const ao = isOnline(a.last_seen_at, now) ? 1 : 0;
    const bo = isOnline(b.last_seen_at, now) ? 1 : 0;
    if (ao !== bo) return bo - ao; // en línea primero
    const at = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const bt = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    return bt - at; // más reciente primero
  });
}

export function EquipoBoard({
  initial,
  meId,
}: {
  initial: TeamMember[];
  meId: string;
}) {
  const [members, setMembers] = useState<TeamMember[]>(initial);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const supabase = createClient();
    let alive = true;

    const refresh = async () => {
      const { data } = await supabase
        .from("sales_reps")
        .select("id, full_name, primary_region, role, last_seen_at")
        .eq("active", true);
      if (alive && data) setMembers(data as TeamMember[]);
      if (alive) setNow(Date.now());
    };

    // Refresca lista cada 30s y el reloj (para etiquetas) cada 15s.
    const dataInt = setInterval(refresh, 30_000);
    const clockInt = setInterval(() => alive && setNow(Date.now()), 15_000);
    return () => {
      alive = false;
      clearInterval(dataInt);
      clearInterval(clockInt);
    };
  }, []);

  const sorted = sortMembers(members, now);
  const onlineCount = sorted.filter((m) => isOnline(m.last_seen_at, now)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="font-medium">{onlineCount} en línea</span>
        <span className="text-muted-foreground">de {sorted.length} del equipo</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((m) => {
          const online = isOnline(m.last_seen_at, now);
          return (
            <Card key={m.id} className={online ? "border-emerald-300" : undefined}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="relative">
                  <div
                    className={
                      "flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold " +
                      (online
                        ? "bg-brand-carmesi text-white"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    {initials(m.full_name)}
                  </div>
                  <span
                    className={
                      "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card " +
                      (online ? "bg-emerald-500" : "bg-zinc-300")
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{m.full_name}</span>
                    {m.id === meId && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Tú</span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {roleLabel(m.role)}
                    {m.primary_region ? ` · ${m.primary_region}` : ""}
                  </div>
                  <div className={"text-xs " + (online ? "text-emerald-600" : "text-muted-foreground")}>
                    {online ? "En línea" : relative(m.last_seen_at, now)}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
