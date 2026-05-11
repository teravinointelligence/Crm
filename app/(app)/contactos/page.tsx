import Link from "next/link";
import { Phone, Mail, MessageCircle, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Contact } from "@/types/database";

export const metadata = { title: "Contactos — TERAVINO CRM" };

type ContactRow = Contact & {
  accounts: { id: string; business_name: string | null; region: string | null } | null;
};

export default async function ContactosPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("contacts")
    .select("*, accounts:account_id(id, business_name, region)")
    .order("is_primary", { ascending: false })
    .order("full_name");

  const contacts = (data ?? []) as ContactRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Contactos</h1>
        <p className="text-sm text-muted-foreground">
          Todos los contactos de tus cuentas.
        </p>
      </div>
      {contacts.length === 0 ? (
        <EmptyState
          title="Sin contactos"
          description="Los contactos se crean desde el detalle de cada cuenta."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contacts.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1">
                      <h3 className="font-medium">{c.full_name}</h3>
                      {c.is_primary && (
                        <Star className="h-3.5 w-3.5 fill-brand-oro text-brand-oro" />
                      )}
                    </div>
                    {c.role && (
                      <p className="text-xs text-muted-foreground">{c.role}</p>
                    )}
                  </div>
                </div>
                {c.accounts && (
                  <Link
                    href={`/cuentas/${c.accounts.id}`}
                    className="block text-sm text-brand-carmesi hover:underline"
                  >
                    {c.accounts.business_name}
                    {c.accounts.region && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {c.accounts.region}
                      </span>
                    )}
                  </Link>
                )}
                <div className="flex flex-wrap gap-2 text-xs">
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"
                    >
                      <Phone className="h-3 w-3" /> {c.phone}
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"
                    >
                      <Mail className="h-3 w-3" /> {c.email}
                    </a>
                  )}
                  {c.whatsapp && (
                    <a
                      href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"
                    >
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
