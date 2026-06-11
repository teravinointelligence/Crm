import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { ContactsGlobalClient } from "@/components/contacts/ContactsGlobalClient";
import { EnviarRecordatorioContactosButton } from "@/components/contacts/EnviarRecordatorioContactosButton";
import type { Contact } from "@/types/database";

export const metadata = { title: "Contactos — TERAVINO CRM" };

type ContactRow = Contact & {
  accounts: { id: string; business_name: string | null; region: string | null } | null;
};

export default async function ContactosPage() {
  const supabase = createClient();
  const [{ data }, rep] = await Promise.all([
    supabase
      .from("contacts")
      .select("*, accounts:account_id(id, business_name, region)")
      .order("is_primary", { ascending: false })
      .order("full_name"),
    getCurrentRep(),
  ]);

  const contacts = (data ?? []) as unknown as ContactRow[];
  const isAdmin = rep?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Contactos</h1>
          <p className="text-sm text-muted-foreground">
            Todos los contactos de tus cuentas.
          </p>
        </div>
        {isAdmin && <EnviarRecordatorioContactosButton />}
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
