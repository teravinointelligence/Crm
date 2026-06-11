// Kanban drag-and-drop: columna "Sin asignar" + una por chofer.
// Soltar una tarjeta sobre otra columna llama a PATCH /api/reparto/pedidos/[id].

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Calendar, GripVertical, AlertCircle, Clock, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { buildRutasUrl, esRezagado } from "@/lib/reparto-rutas";
import { ESTATUS_LABEL, ESTATUS_VARIANT, type PedidoEstatus } from "@/types/reparto";

const UNASSIGNED = "__sin_asignar__";

type Chofer = { id: string; nombre: string; email: string };
type Pedido = {
  id: string;
  numero_factura: string;
  fecha: string;
  ventana_inicio: string | null;
  ventana_fin: string | null;
  estatus: PedidoEstatus;
  prioridad: string | null;
  total: number | null;
  chofer_id: string | null;
  direccion_entrega: string | null;
  horario_recepcion: string | null;
  clientes: { id: string; nombre: string; ciudad: string | null; zona: string | null } | null;
};

export function KanbanRutas({
  fecha,
  incluirRezagados = false,
  pedidos: initial,
  choferes,
  canManage = true,
}: {
  fecha: string;
  incluirRezagados?: boolean;
  pedidos: Pedido[];
  choferes: Chofer[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Pedido[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // El estado local existe solo para el update optimista del drag&drop; cuando
  // el server manda datos nuevos (cambio de fecha, toggle de rezagados o
  // router.refresh) hay que re-sincronizar. Patrón de React de "reset durante
  // render" — sin esto el tablero se queda con la lista vieja (el bug del
  // "Cargar" con desfase de un clic).
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setPedidos(initial);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const grouped = useMemo(() => {
    const map = new Map<string, Pedido[]>();
    map.set(UNASSIGNED, []);
    for (const c of choferes) map.set(c.id, []);
    for (const p of pedidos) {
      const key = p.chofer_id ?? UNASSIGNED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [pedidos, choferes]);

  const activePedido = pedidos.find((p) => p.id === activeId) ?? null;

  // Conteo del encabezado: los del día se reportan igual que siempre; los
  // rezagados (fecha anterior, aún sin entregar) se desglosan aparte.
  const rezagadosCount = pedidos.filter((p) => esRezagado(p, fecha)).length;
  const delDiaCount = pedidos.length - rezagadosCount;

  const onDragStart = (e: DragStartEvent) => {
    if (!canManage) return;
    setActiveId(String(e.active.id));
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!canManage) return;
    const pedidoId = String(e.active.id);
    const targetCol = e.over ? String(e.over.id) : null;
    if (!targetCol) return;

    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return;
    const currentCol = pedido.chofer_id ?? UNASSIGNED;
    if (currentCol === targetCol) return;

    const newChoferId = targetCol === UNASSIGNED ? null : targetCol;
    // Si el pedido está entregado/no entregado, no permitir reasignar.
    if (pedido.estatus === "entregado" || pedido.estatus === "no_entregado") {
      toast.error(`No se puede reasignar (estatus: ${ESTATUS_LABEL[pedido.estatus]})`);
      return;
    }

    // Optimista: actualiza local
    const prevSnapshot = pedidos;
    setPedidos((cur) =>
      cur.map((p) =>
        p.id === pedidoId
          ? {
              ...p,
              chofer_id: newChoferId,
              estatus:
                newChoferId == null
                  ? "pendiente_asignar"
                  : p.estatus === "pendiente_asignar"
                    ? "asignado"
                    : p.estatus,
            }
          : p,
      ),
    );

    startTransition(async () => {
      const res = await fetch(`/api/reparto/pedidos/${pedidoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chofer_id: newChoferId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "No se pudo reasignar");
        setPedidos(prevSnapshot);
        return;
      }
      const target = newChoferId ? choferes.find((c) => c.id === newChoferId)?.nombre : "sin asignar";
      toast.success(`${pedido.numero_factura} → ${target}`);
      router.refresh();
    });
  };

  const columns: { id: string; titulo: string; subtitulo: string }[] = [
    { id: UNASSIGNED, titulo: "Sin asignar", subtitulo: "Arrastra hacia un chofer →" },
    ...choferes.map((c) => ({ id: c.id, titulo: c.nombre, subtitulo: c.email })),
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 pb-2">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fecha">Fecha de operación</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              {/* La URL es la única fuente de verdad: el input no tiene estado
                  propio (defaultValue + key) y navega al cambiar — un solo
                  gesto recarga URL, encabezado y tarjetas, sin desfase. */}
              <Input
                id="fecha"
                type="date"
                key={fecha}
                defaultValue={fecha}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && v !== fecha) router.push(buildRutasUrl(v, incluirRezagados));
                }}
                className="pl-9"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 pb-2.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={incluirRezagados}
              onChange={(e) => router.push(buildRutasUrl(fecha, e.target.checked))}
              className="h-4 w-4 rounded border-input"
            />
            Incluir pendientes de días anteriores
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {delDiaCount} pedido(s) en {fecha}
          {rezagadosCount > 0 && (
            <span className="text-amber-700"> · +{rezagadosCount} rezagado(s)</span>
          )}
          {pending && " · guardando…"}
        </p>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {columns.map((col) => (
            <Column key={col.id} id={col.id} titulo={col.titulo} subtitulo={col.subtitulo} pedidos={grouped.get(col.id) ?? []} canManage={canManage} fechaOperacion={fecha} />
          ))}
        </div>
        <DragOverlay>
          {activePedido ? <PedidoCardView pedido={activePedido} fechaOperacion={fecha} dragging /> : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}

function Column({
  id,
  titulo,
  subtitulo,
  pedidos,
  canManage,
  fechaOperacion,
}: {
  id: string;
  titulo: string;
  subtitulo: string;
  pedidos: Pedido[];
  canManage: boolean;
  fechaOperacion: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const isUnassigned = id === UNASSIGNED;
  const total = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-lg border bg-card transition-colors",
        isOver && "border-brand-carmesi bg-accent/10",
        isUnassigned && "border-dashed",
      )}
    >
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base">{titulo}</h3>
          <p className="truncate text-[11px] text-muted-foreground">{subtitulo}</p>
        </div>
        <Badge variant={isUnassigned ? "warning" : "muted"} className="shrink-0">{pedidos.length}</Badge>
      </div>
      <div className="flex-1 space-y-2 p-2 min-h-[120px]">
        {pedidos.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {isUnassigned ? "Sin pendientes." : "Sin pedidos asignados."}
          </p>
        ) : (
          pedidos.map((p) => <PedidoCard key={p.id} pedido={p} canManage={canManage} fechaOperacion={fechaOperacion} />)
        )}
      </div>
      {pedidos.length > 0 && (
        <div className="border-t px-3 py-1.5 text-right text-[11px] text-muted-foreground">
          {formatCurrency(total)}
        </div>
      )}
    </div>
  );
}

function PedidoCard({ pedido, canManage, fechaOperacion }: { pedido: Pedido; canManage: boolean; fechaOperacion: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: pedido.id, disabled: !canManage });
  return (
    <div
      ref={setNodeRef}
      {...(canManage ? attributes : {})}
      {...(canManage ? listeners : {})}
      className={cn(
        "rounded-md border bg-background p-2.5 text-xs shadow-sm transition-opacity",
        canManage && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
    >
      <PedidoCardView pedido={pedido} fechaOperacion={fechaOperacion} />
    </div>
  );
}

function PedidoCardView({
  pedido,
  fechaOperacion,
  dragging = false,
}: {
  pedido: Pedido;
  fechaOperacion?: string;
  dragging?: boolean;
}) {
  const rezagado = fechaOperacion ? esRezagado(pedido, fechaOperacion) : false;
  return (
    <div className={cn("space-y-1", dragging && "rounded-md border bg-card p-2.5 shadow-lg")}>
      {rezagado && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
          title="Pedido pendiente de un día anterior"
        >
          <History className="h-3 w-3" />
          Rezagado · {formatDate(pedido.fecha)}
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/reparto/pedidos/${pedido.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 font-medium hover:text-brand-carmesi"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
          {pedido.numero_factura}
        </Link>
        <Badge variant={ESTATUS_VARIANT[pedido.estatus]} className="text-[10px]">
          {ESTATUS_LABEL[pedido.estatus]}
        </Badge>
      </div>
      <p className="truncate font-medium">{pedido.clientes?.nombre ?? "—"}</p>
      <p className="truncate text-[11px] text-muted-foreground">
        {[pedido.clientes?.zona ?? pedido.clientes?.ciudad, pedido.direccion_entrega].filter(Boolean).join(" · ") || "Sin dirección"}
      </p>
      {pedido.horario_recepcion && (
        <p className="flex items-center gap-1 text-[11px] text-brand-carmesi" title="Horario de recepción de mercancía">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">{pedido.horario_recepcion}</span>
        </p>
      )}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          {pedido.ventana_inicio ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5">
              {pedido.ventana_inicio.slice(0, 5)}
              {pedido.ventana_fin ? `–${pedido.ventana_fin.slice(0, 5)}` : ""}
            </span>
          ) : null}
          {pedido.prioridad && pedido.prioridad !== "normal" && (
            <span className="inline-flex items-center gap-0.5 text-amber-700">
              <AlertCircle className="h-3 w-3" /> {pedido.prioridad}
            </span>
          )}
        </div>
        <span className="font-medium">{formatCurrency(pedido.total)}</span>
      </div>
    </div>
  );
}
