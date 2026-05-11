"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Phone, Mail, MessageCircle, Star, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/types/database";

type ContactRow = Contact & {
  accounts: { id: string; business_name: string | null; region: string | null } | null;
};

export function ContactsGlobalClient({ contacts }: { contacts: ContactRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const payload = {
      full_name: String(fd.get("full_name") ?? "").trim(),
      role: String(fd.get("role") ?? "") || null,
      email: String(fd.get("email") ?? "") || null,
      phone: String(fd.get("phone") ?? "") || null,
      whatsapp: String(fd.get("whatsapp") ?? "") || null,
      is_primary: fd.get("is_primary") === "on",
      notes: String(fd.get("notes") ?? "") || null,
    };
    if (!payload.full_name) {
      toast.error("Nombre obligatorio");
      return;
    }
    startTransition(async () => {
      if (payload.is_primary && editing.account_id) {
        await supabase
          .from("contacts")
          .update({ is_primary: false })
          .eq("account_id", editing.account_id);
      }
      const { error } = await supabase
        .from("contacts")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        toast.error("No pudimos guardar", { description: error.message });
        return;
      }
      toast.success("Contacto actualizado");
      setEditing(null);
      router.refresh();
    });
  };

  return (
    <>
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditing(c)}
                  aria-label="Editar contacto"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
              {c.accounts && (
                <Link
                  href={`/cuentas/${c.accounts.id}`}
                  className="block text-sm text-brand-carmesi hover:underline"
                >
                  {c.accounts.business_name}
                  {c.accounts.region && (
                    <span className="text-muted-foreground"> · {c.accounts.region}</span>
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
              {c.notes && (
                <p className="border-t pt-2 text-xs text-muted-foreground">{c.notes}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleSubmit} className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Nombre *</Label>
                <Input id="full_name" name="full_name" required defaultValue={editing.full_name} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Cargo</Label>
                <Input id="role" name="role" defaultValue={editing.role ?? ""} placeholder="Sommelier, F&B Manager, Compras…" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" defaultValue={editing.email ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" name="phone" defaultValue={editing.phone ?? ""} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input id="whatsapp" name="whatsapp" defaultValue={editing.whatsapp ?? ""} placeholder="521..." />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_primary"
                  defaultChecked={editing.is_primary ?? false}
                  className="h-4 w-4 rounded border-input text-brand-carmesi focus:ring-brand-carmesi"
                />
                Contacto principal de la cuenta
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" name="notes" defaultValue={editing.notes ?? ""} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
