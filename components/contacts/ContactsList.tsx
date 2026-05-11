"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Phone,
  Mail,
  MessageCircle,
  Star,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/types/database";

type Props = { accountId: string; contacts: Contact[] };

export function ContactsList({ accountId, contacts }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [pending, startTransition] = useTransition();

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (contact: Contact) => {
    setEditing(contact);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      account_id: accountId,
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
      if (payload.is_primary) {
        await supabase
          .from("contacts")
          .update({ is_primary: false })
          .eq("account_id", accountId);
      }
      const { error } = editing
        ? await supabase
            .from("contacts")
            .update(payload)
            .eq("id", editing.id)
        : await supabase.from("contacts").insert(payload);
      if (error) {
        toast.error("No pudimos guardar el contacto", {
          description: error.message,
        });
        return;
      }
      toast.success(editing ? "Contacto actualizado" : "Contacto creado");
      setOpen(false);
      router.refresh();
    });
  };

  const handleDelete = (contact: Contact) => {
    if (!confirm(`¿Eliminar a ${contact.full_name}?`)) return;
    startTransition(async () => {
      const { error } = await supabase
        .from("contacts")
        .delete()
        .eq("id", contact.id);
      if (error) {
        toast.error("No pudimos eliminar", { description: error.message });
        return;
      }
      toast.success("Contacto eliminado");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Contactos</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Nuevo contacto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar contacto" : "Nuevo contacto"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Nombre *</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  required
                  defaultValue={editing?.full_name}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Cargo</Label>
                <Input
                  id="role"
                  name="role"
                  defaultValue={editing?.role ?? ""}
                  placeholder="Sommelier, F&B Manager, Compras…"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={editing?.email ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={editing?.phone ?? ""}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  name="whatsapp"
                  defaultValue={editing?.whatsapp ?? ""}
                  placeholder="521..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_primary"
                  defaultChecked={editing?.is_primary ?? false}
                  className="h-4 w-4 rounded border-input text-brand-carmesi focus:ring-brand-carmesi"
                />
                Contacto principal
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={editing?.notes ?? ""}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          title="Sin contactos"
          description="Agrega al menos un contacto para esta cuenta."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{c.full_name}</h3>
                      {c.is_primary && (
                        <Badge variant="accent" className="gap-1">
                          <Star className="h-3 w-3" /> Principal
                        </Badge>
                      )}
                    </div>
                    {c.role && (
                      <p className="text-xs text-muted-foreground">{c.role}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600"
                      onClick={() => handleDelete(c)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
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
                  <p className="border-t pt-2 text-xs text-muted-foreground">
                    {c.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
