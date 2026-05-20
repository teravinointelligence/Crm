"use client";

// Gestión de usuarios (solo admin): alta + edición de rol, región, módulos y estado.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SELECTABLE_MODULES, ALL_MODULE_KEYS, ROLES, ROLE_LABEL, type UserRole } from "@/lib/modules";
import { REGIONS, type SalesRep } from "@/types/database";

type Draft = {
  email: string;
  full_name: string;
  role: UserRole;
  primary_region: string;
  password: string;
  modules: string[];
};

const emptyDraft = (): Draft => ({
  email: "",
  full_name: "",
  role: "rep",
  primary_region: "",
  password: "",
  modules: [...ALL_MODULE_KEYS],
});

export function UsuariosClient({ users }: { users: SalesRep[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [editRole, setEditRole] = useState<UserRole>("rep");
  const [editRegion, setEditRegion] = useState<string>("");

  const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

  const create = () => {
    startTransition(async () => {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: draft.email,
          full_name: draft.full_name,
          role: draft.role,
          primary_region: draft.primary_region || null,
          password: draft.password,
          modules: draft.role !== "admin" ? draft.modules : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo crear el usuario", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success(`Usuario ${draft.full_name} creado`);
      setCreating(false);
      setDraft(emptyDraft());
      router.refresh();
    });
  };

  const startEdit = (u: SalesRep) => {
    setEditingId(u.id);
    setEditRole((u.role as UserRole) ?? "rep");
    setEditRegion(u.primary_region ?? "");
    setEditModules(u.modules ?? [...ALL_MODULE_KEYS]);
  };

  const saveEdit = (u: SalesRep) => {
    startTransition(async () => {
      const res = await fetch(`/api/usuarios/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editRole,
          primary_region: editRegion || null,
          modules: editRole !== "admin" ? editModules : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo guardar", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Usuario actualizado");
      setEditingId(null);
      router.refresh();
    });
  };

  const toggleActive = (u: SalesRep) => {
    startTransition(async () => {
      const res = await fetch(`/api/usuarios/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !u.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("No se pudo cambiar el estado", { description: data.error });
        return;
      }
      toast.success(u.active ? "Usuario desactivado" : "Usuario activado");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <UserPlus className="mr-1 h-4 w-4" /> Nuevo usuario
          </Button>
        )}
      </div>

      {/* Alta */}
      {creating && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">Nuevo usuario</h2>
              <Button variant="ghost" size="icon" onClick={() => setCreating(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="nu_nombre">Nombre completo</Label>
                <Input id="nu_nombre" value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nu_email">Email</Label>
                <Input id="nu_email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="nombre@teravino.com" />
              </div>
              <div className="space-y-1">
                <Label>Rol</Label>
                <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v as UserRole })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Región</Label>
                <Select value={draft.primary_region || undefined} onValueChange={(v) => setDraft({ ...draft, primary_region: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="nu_pwd">Contraseña temporal</Label>
                <Input id="nu_pwd" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="mín. 8 caracteres — el usuario la cambia luego" />
              </div>
            </div>

            {draft.role !== "admin" && (
              <div className="space-y-2">
                <Label>Módulos visibles</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SELECTABLE_MODULES.map((m) => (
                    <label key={m.key} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.modules.includes(m.key)}
                        onChange={() => setDraft({ ...draft, modules: toggle(draft.modules, m.key) })}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">El admin siempre ve todos los módulos.</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreating(false)} disabled={pending}>Cancelar</Button>
              <Button onClick={create} disabled={pending || !draft.email || !draft.full_name || draft.password.length < 8}>
                {pending ? "Creando…" : "Crear usuario"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Nombre</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Rol</th>
                  <th className="px-4 py-2 text-left">Región</th>
                  <th className="px-4 py-2 text-left">Módulos</th>
                  <th className="px-4 py-2 text-left">Estado</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isEditing = editingId === u.id;
                  return (
                    <tr key={u.id} className="border-t align-top">
                      <td className="px-4 py-2 font-medium">{u.full_name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
                            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ROLES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={u.role === "admin" ? "accent" : "muted"}>
                            {ROLE_LABEL[(u.role as UserRole) ?? "rep"] ?? u.role}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <Select value={editRegion || undefined} onValueChange={setEditRegion}>
                            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">{u.primary_region ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 max-w-xs">
                        {isEditing && editRole !== "admin" ? (
                          <div className="grid grid-cols-2 gap-1">
                            {SELECTABLE_MODULES.map((m) => (
                              <label key={m.key} className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={editModules.includes(m.key)}
                                  onChange={() => setEditModules((l) => toggle(l, m.key))}
                                />
                                {m.label}
                              </label>
                            ))}
                          </div>
                        ) : u.role === "admin" ? (
                          <span className="text-xs text-muted-foreground">Todos</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {u.modules == null ? "Todos (estándar)" : `${u.modules.length} módulos`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => toggleActive(u)}
                          disabled={pending}
                          className="cursor-pointer"
                          title="Activar/desactivar"
                        >
                          <Badge variant={u.active ? "success" : "danger"}>{u.active ? "Activo" : "Inactivo"}</Badge>
                        </button>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={pending}>Cancelar</Button>
                            <Button size="sm" onClick={() => saveEdit(u)} disabled={pending}>Guardar</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => startEdit(u)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
