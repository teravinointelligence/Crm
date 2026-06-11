"use client";

// Herramientas de limpieza (SOLO admin) para una consignación:
//   - Archivar como duplicada/basura → REVERSIBLE, con motivo y confirmación.
//   - Restaurar una archivada → un clic con confirmación.
//   - Eliminar definitivamente → IRREVERSIBLE: solo sobre archivadas, doble
//     confirmación (diálogo + teclear el nombre exacto del cliente).
// Toda acción queda en las notas de la consignación (quién y cuándo, lo
// estampa el server con appendNota).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Base44Consignacion } from "@/lib/base44";

type Props = {
  consignacion: Pick<
    Base44Consignacion,
    "id" | "cliente_nombre" | "archivada" | "archivada_motivo" | "cantidad_vendida" | "cantidad_devuelta" | "monto_cobrado"
  >;
};

export function ArchivarConsignacion({ consignacion }: Props) {
  if (consignacion.archivada) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <RestaurarDialog consignacion={consignacion} />
        <EliminarDialog consignacion={consignacion} />
      </div>
    );
  }
  return <ArchivarDialog consignacion={consignacion} />;
}

function ArchivarDialog({ consignacion }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("Duplicada de otra consignación");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/${consignacion.id}/archivar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "archivar", motivo: motivo.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("No se pudo archivar", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Consignación archivada (reversible con Restaurar)");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Archive className="mr-1 h-3.5 w-3.5" />
          Archivar como duplicada
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Archivar consignación</DialogTitle>
          <DialogDescription>
            La consignación de <strong>{consignacion.cliente_nombre ?? "—"}</strong> saldrá de los
            listados y KPIs, pero <strong>no se borra</strong>: puedes restaurarla cuando quieras.
            Quedará registrado quién y cuándo la archivó.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="motivo">Motivo</Label>
          <Input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !motivo.trim()}>
            {pending ? "Archivando…" : "Archivar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestaurarDialog({ consignacion }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/${consignacion.id}/archivar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "restaurar" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("No se pudo restaurar", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Consignación restaurada");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
          Restaurar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Restaurar consignación</DialogTitle>
          <DialogDescription>
            Vuelve a aparecer en listados y KPIs. El historial del archivado queda en las notas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Restaurando…" : "Restaurar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EliminarDialog({ consignacion }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [pending, startTransition] = useTransition();

  const nombre = (consignacion.cliente_nombre ?? "").trim();
  const tieneMovimientos =
    Number(consignacion.cantidad_vendida ?? 0) > 0 ||
    Number(consignacion.cantidad_devuelta ?? 0) > 0 ||
    Number(consignacion.monto_cobrado ?? 0) > 0;
  const coincide = confirmacion.trim() === nombre && nombre.length > 0;

  const submit = () => {
    startTransition(async () => {
      const res = await fetch(`/api/consignaciones/${consignacion.id}/eliminar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacion: confirmacion.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("No se pudo eliminar", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Consignación eliminada definitivamente");
      router.push("/consignaciones");
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmacion(""); }}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={tieneMovimientos}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Eliminar definitivamente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar definitivamente</DialogTitle>
          <DialogDescription>
            <strong>Esta acción es IRREVERSIBLE.</strong> La consignación de{" "}
            <strong>{nombre || "—"}</strong> se borra de TERAVINO Flow y no se puede recuperar.
            Si tienes duda, déjala archivada — archivada no estorba.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="confirmacion">
            Para confirmar, escribe el nombre exacto del cliente: <strong>{nombre}</strong>
          </Label>
          <Input
            id="confirmacion"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            placeholder={nombre}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending || !coincide}>
            {pending ? "Eliminando…" : "Eliminar para siempre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
