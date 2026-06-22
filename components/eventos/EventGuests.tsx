"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, Trash2, UserCheck, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AccountCombobox } from "@/components/accounts/AccountCombobox";
import { createClient } from "@/lib/supabase/client";
import {
  CONFIRMATION_STATUS_BADGE,
  CONFIRMATION_STATUS_LABEL,
  type AccountOption,
  type ConfirmationStatus,
} from "@/lib/visitas/constants";

const NONE = "__none__";

export type GuestRow = {
  id: string;
  account_id: string | null;
  contact_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  invitation_status: string;
  confirmation_status: ConfirmationStatus;
  checked_in: boolean;
  contact: { full_name: string | null; email: string | null } | null;
  account: { business_name: string | null } | null;
};

type ContactRow = { id: string; full_name: string; email: string | null };

export function EventGuests({
  eventId,
  guests,
  accounts,
  repId,
  canInvite,
}: {
  eventId: string;
  guests: GuestRow[];
  accounts: AccountOption[];
  repId: string;
  canInvite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(NONE);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loadingContacts, setLoadingContacts] = useState(false);
  // alta manual (cliente sin contacto en CRM)
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");

  const stats = useMemo(() => {
    const accepted = guests.filter((g) => g.confirmation_status === "accepted").length;
    const declined = guests.filter((g) => g.confirmation_status === "declined").length;
    const pendingN = guests.filter((g) => g.confirmation_status === "pending").length;
    return { accepted, declined, pendingN, total: guests.length };
  }, [guests]);

  const onPickAccount = async (id: string) => {
    setAccountId(id);
    setPicked(new Set());
    setContacts([]);
    if (id === NONE) return;
    setLoadingContacts(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("contacts")
      .select("id, full_name, email")
      .eq("account_id", id)
      .order("full_name");
    setContacts((data ?? []) as ContactRow[]);
    setLoadingContacts(false);
  };

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addGuests = () => {
    const acc = accountId === NONE ? null : accountId;
    const rows: Record<string, unknown>[] = [];
    for (const c of contacts) {
      if (!picked.has(c.id)) continue;
      rows.push({
        event_id: eventId,
        account_id: acc,
        contact_id: c.id,
        guest_name: c.full_name,
        guest_email: c.email,
        invited_by: repId,
      });
    }
    if (manualName.trim()) {
      rows.push({
        event_id: eventId,
        account_id: acc,
        guest_name: manualName.trim(),
        guest_email: manualEmail.trim() || null,
        invited_by: repId,
      });
    }
    if (rows.length === 0) return void toast.error("Selecciona contactos o captura un invitado.");
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("event_guests").insert(rows);
      if (error) return void toast.error("No se pudo agregar", { description: error.message });
      toast.success(`${rows.length} invitado(s) agregado(s)`);
      setOpen(false);
      setAccountId(NONE);
      setContacts([]);
      setPicked(new Set());
      setManualName("");
      setManualEmail("");
      router.refresh();
    });
  };

  const sendInvitations = (guestIds?: string[]) => {
    startTransition(async () => {
      const res = await fetch(`/api/eventos/${eventId}/invitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guestIds ? { guestIds } : {}),
      });
      const json = await res.json();
      if (!res.ok) return void toast.error("No se pudo enviar", { description: json.error });
      toast.success(`${json.sent} invitación(es) enviada(s)`, {
        description: json.skipped?.length ? `Sin correo: ${json.skipped.length}` : undefined,
      });
      router.refresh();
    });
  };

  const toggleCheckIn = (g: GuestRow) => {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("event_guests")
        .update({
          checked_in: !g.checked_in,
          checked_in_at: !g.checked_in ? new Date().toISOString() : null,
        })
        .eq("id", g.id);
      if (error) return void toast.error("No se pudo actualizar", { description: error.message });
      router.refresh();
    });
  };

  const remove = (g: GuestRow) => {
    if (!confirm("¿Quitar invitado?")) return;
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("event_guests").delete().eq("id", g.id);
      if (error) return void toast.error("No se pudo quitar", { description: error.message });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl">Invitados</h2>
          <p className="text-sm text-muted-foreground">
            {stats.total} invitados · {stats.accepted} confirmados · {stats.pendingN} pendientes ·{" "}
            {stats.declined} declinaron
          </p>
        </div>
        {canInvite && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Agregar
            </Button>
            <Button size="sm" onClick={() => sendInvitations()} disabled={pending || stats.total === 0}>
              <Send className="mr-1 h-4 w-4" /> Enviar pendientes
            </Button>
          </div>
        )}
      </div>

      {guests.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay invitados.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Invitado</th>
                <th className="px-3 py-2">Cuenta</th>
                <th className="px-3 py-2">RSVP</th>
                <th className="px-3 py-2">Check-in</th>
                {canInvite && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => {
                const name = g.guest_name || g.contact?.full_name || "—";
                const email = g.guest_email || g.contact?.email;
                return (
                  <tr key={g.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{name}</div>
                      {email && (
                        <div className="text-xs text-muted-foreground">{email}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {g.account?.business_name ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={CONFIRMATION_STATUS_BADGE[g.confirmation_status]}>
                        {CONFIRMATION_STATUS_LABEL[g.confirmation_status]}
                      </Badge>
                      {g.invitation_status === "sent" && (
                        <span className="ml-1 inline-flex" title="Invitación enviada">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => canInvite && toggleCheckIn(g)}
                        disabled={!canInvite || pending}
                        className={
                          g.checked_in
                            ? "inline-flex items-center gap-1 text-green-700"
                            : "inline-flex items-center gap-1 text-muted-foreground"
                        }
                      >
                        <UserCheck className="h-4 w-4" />
                        {g.checked_in ? "Sí" : "No"}
                      </button>
                    </td>
                    {canInvite && (
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Reenviar invitación"
                            onClick={() => sendInvitations([g.id])}
                            disabled={pending}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(g)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar invitados</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cuenta</Label>
              <AccountCombobox
                accounts={accounts}
                value={accountId}
                onChange={onPickAccount}
                noneValue={NONE}
                noneLabel="Sin cuenta"
              />
            </div>
            {loadingContacts && <p className="text-sm text-muted-foreground">Cargando contactos…</p>}
            {contacts.length > 0 && (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                {contacts.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded p-1.5 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={picked.has(c.id)}
                      onChange={() => togglePick(c.id)}
                    />
                    <span className="text-sm">
                      {c.full_name}
                      {c.email ? (
                        <span className="text-muted-foreground"> · {c.email}</span>
                      ) : (
                        <span className="text-amber-600"> · sin correo</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {accountId !== NONE && !loadingContacts && contacts.length === 0 && (
              <p className="text-sm text-muted-foreground">Esta cuenta no tiene contactos.</p>
            )}
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                O agrega un invitado manual
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Nombre"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
                <Input
                  placeholder="Correo"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={addGuests} disabled={pending}>
                Agregar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
