import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { ContactsGlobalClient } from "@/components/contacts/ContactsGlobalClient";
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

  const contacts = (data ?? []) as unknown as ContactRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl">Contactos</h1>
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
        <ContactsGlobalClient contacts={contacts} />
      )}
    </div>
  );
}
