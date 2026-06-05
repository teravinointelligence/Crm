"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const ONLINE_MS = 5 * 60_000;

/** Píldora "N en línea" para el Dashboard; enlaza a /equipo y se refresca sola. */
export function OnlinePill({ initialOnline }: { initialOnline: number }) {
  const [online, setOnline] = useState(initialOnline);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    const refresh = async () => {
      const { data } = await supabase
        .from("sales_reps")
        .select("last_seen_at")
        .eq("active", true);
      if (!alive || !data) return;
      const now = Date.now();
      setOnline(
        data.filter(
          (r) => r.last_seen_at && now - new Date(r.last_seen_at).getTime() < ONLINE_MS,
        ).length,
      );
    };
    const int = setInterval(refresh, 30_000);
    return () => {
      alive = false;
      clearInterval(int);
    };
  }, []);

  return (
    <Link
      href="/equipo"
      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      {online} en línea
    </Link>
  );
}
