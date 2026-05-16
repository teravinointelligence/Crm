// Administración de choferes: tabla con todos + crear/editar/activar/desactivar.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Phone, Mail, Power, KeyRound, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Usuario = {
  id: string;
  auth_id: string | null;
  nombre: string;
  email: string;
  rol: string | null;
  telefono: string | null;
  activo: boolean;
  es_chofer: boolean;
};

export function ChoferesAdmin({ usuarios: initial }: { usuarios: Usuario[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [usuarios, setUsuarios] = useState<Usuario[]>(initial);
  const [filter, setFilter] = useState<"choferes" | "todos" | "inactivos">("choferes");

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Usuario | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  const filtered = usuarios.filter((u) => {
    if (filter === "choferes") return u.es_chofer && u.activo;
    if (filter === "inactivos") return !u.activo;
    return true;
  });

  const toggleActivo = (u: Usuario) => {
    const next = !u.activo;
    setUsuarios((cur) => cur.map((x) => (x.id === u.id ? { ...x, activo: next } : x)));
    startTransition(async () => {
      const res = await fetch(`/api/reparto/usuarios/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "No se pudo actualizar");
        setUsuarios((cur) => cur.map((x) => (x.id === u.id ? { ...x, activo: !next } : x)));
        return;
      }
      toast.success(next ? "Activado" : "Desactivado");
      router.refresh();
    });
  };

  const saveEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!edit) return;
    const fd = new FormData(e.currentTarget);
    const payload = {
      nombre: String(fd.get("nombre") ?? "").trim(),
      telefono: String(fd.get("telefono") ?? "").trim(),
      rol: String(fd.get("rol") ?? "").trim(),
      es_chofer: fd.get("es_chofer") === "on",
      activo: fd.get("activo") === "on",
    };
    if (!payload.nombre) { toast.error("Nombre obligatorio"); return; }
    startTransition(async () => {
      const res = await fetch(`/api/reparto/usuarios/${edit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error ?? "Error al guardar"); return; }
      setUsuarios((cur) => cur.map((x) => (x.id === edit.id ? { ...x, ...j.data } : x)));
      toast.success("Chofer actualizado");
      setEdit(null);
      router.refresh();
    });
  };

  const create = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      nombre: String(fd.get("nombre") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim().toLowerCase(),
      telefono: String(fd.get("telefono") ?? "").trim(),
      rol: String(fd.get("rol") ?? "").trim() || "chofer",
      es_chofer: fd.get("es_chofer") === "on",
      crear_auth: fd.get("crear_auth") === "on",
      password: String(fd.get("password") ?? "").trim(),
    };
    if (!payload.nombre) { toast.error("Nombre obligatorio"); return; }
    if (!payload.email) { toast.error("Email obligatorio"); return; }
    startTransition(async () => {
      const res = await fetch("/api/reparto/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error ?? "Error al crear"); return; }
      setUsuarios((cur) => [...cur, j.data]);
      toast.success("Chofer creado");
      if (j.temp_password) {
        setCreatedPassword(j.temp_password);
        setCreatedEmail(payload.email);
      } else {
        setOpen(false);
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5 rounded-lg border bg-card p-1">
          {([
            { v: "choferes", label: "Choferes activos" },
            { v: "todos", label: "Todos" },
            { v: "inactivos", label: "Inactivos" },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setFilter(opt.v)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${filter === opt.v ? "bg-brand-carmesi text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setCreatedPassword(null); setCreatedEmail(null); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> Nuevo chofer</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo chofer</DialogTitle></DialogHeader>
            {createdPassword ? (
              <div className="space-y-3">
                <p className="text-sm">El chofer puede ingresar a la app móvil con:</p>
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div><strong>Email:</strong> {createdEmail}</div>
                    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(createdEmail ?? ""); toast.success("Copiado"); }}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div><strong>Password temporal:</strong> <code className="rounded bg-card px-1.5 py-0.5">{createdPassword}</code></div>
                    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(createdPassword); toast.success("Copiado"); }}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Compártela por un canal seguro. Pídele que la cambie al primer login.</p>
                <div className="flex justify-end"><Button onClick={() => { setCreatedPassword(null); setCreatedEmail(null); setOpen(false); }}>Listo</Button></div>
              </div>
            ) : (
              <form onSubmit={create} className="grid gap-3">
                <div className="space-y-1.5"><Label htmlFor="nombre">Nombre *</Label>
                  <Input id="nombre" name="nombre" required /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="email">Email *</Label>
                    <Input id="email" name="email" type="email" required /></div>
                  <div className="space-y-1.5"><Label htmlFor="telefono">Teléfono</Label>
                    <Input id="telefono" name="telefono" placeholder="624..." /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="rol">Rol</Label>
                  <Input id="rol" name="rol" placeholder="chofer / supervisor / admin" defaultValue="chofer" /></div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="es_chofer" defaultChecked className="h-4 w-4 rounded border-input text-brand-carmesi" />
                  Es chofer (sale a reparto)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="crear_auth" defaultChecked className="h-4 w-4 rounded border-input text-brand-carmesi" />
                  Crear acceso a la app móvil
                </label>
                <div className="space-y-1.5"><Label htmlFor="password">Password (opcional)</Label>
                  <Input id="password" name="password" type="text" placeholder="déjalo vacío y se genera uno aleatorio" /></div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
                  <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear chofer"}</Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} usuario(s)</p>

      <Card><CardContent className="p-0">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Sin usuarios en este filtro.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.nombre}</div>
                    {!u.auth_id && <div className="inline-flex items-center gap-1 text-[10px] text-amber-700"><KeyRound className="h-3 w-3" /> sin acceso a app</div>}
                  </td>
                  <td className="px-4 py-3">
                    <a href={`mailto:${u.email}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-brand-carmesi">
                      <Mail className="h-3.5 w-3.5" /> {u.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.telefono ? (
                      <a href={`tel:${u.telefono}`} className="inline-flex items-center gap-1 hover:text-brand-carmesi"><Phone className="h-3.5 w-3.5" /> {u.telefono}</a>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.rol ?? "—"}</td>
                  <td className="px-4 py-3">
                    {u.es_chofer ? <Badge variant="accent">chofer</Badge> : <Badge variant="muted">{u.rol ?? "usuario"}</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {u.activo
                      ? <Badge variant="success">activo</Badge>
                      : <Badge variant="danger">inactivo</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggleActivo(u)}>
                      <Power className={`h-3.5 w-3.5 ${u.activo ? "text-red-600" : "text-emerald-700"}`} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent></Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar chofer</DialogTitle></DialogHeader>
          {edit && (
            <form onSubmit={saveEdit} className="grid gap-3">
              <div className="space-y-1.5"><Label htmlFor="e_nombre">Nombre *</Label>
                <Input id="e_nombre" name="nombre" defaultValue={edit.nombre} required /></div>
              <div className="space-y-1.5"><Label>Email (no editable)</Label>
                <Input value={edit.email} readOnly disabled /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="e_telefono">Teléfono</Label>
                  <Input id="e_telefono" name="telefono" defaultValue={edit.telefono ?? ""} /></div>
                <div className="space-y-1.5"><Label htmlFor="e_rol">Rol</Label>
                  <Input id="e_rol" name="rol" defaultValue={edit.rol ?? ""} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="es_chofer" defaultChecked={edit.es_chofer} className="h-4 w-4 rounded border-input text-brand-carmesi" />
                Es chofer
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="activo" defaultChecked={edit.activo} className="h-4 w-4 rounded border-input text-brand-carmesi" />
                Activo
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEdit(null)} disabled={pending}>Cancelar</Button>
                <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
