import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SalesRep } from "@/types/database";

export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentRep(): Promise<SalesRep | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("sales_reps")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();
  return data;
}

export async function requireRep() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  return rep;
}

export async function isAdmin() {
  const rep = await getCurrentRep();
  return rep?.role === "admin";
}
