"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/utils";
import type { SalesRep } from "@/types/database";

export function UserMenu({ rep }: { rep: SalesRep }) {
  const router = useRouter();
  const supabase = createClient();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="hidden text-right text-xs sm:block">
        <div className="font-medium">{rep.full_name}</div>
        <div className="text-muted-foreground">{rep.email}</div>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-carmesi text-xs font-semibold text-white">
        {initials(rep.full_name)}
      </div>
      <Button variant="ghost" size="icon" onClick={signOut} aria-label="Salir">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
