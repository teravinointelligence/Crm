"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableScroll } from "@/components/ui/table-scroll";
import { CATEGORY_ORDER, CATEGORY_POINTS, type Category, type IncentiveProgram } from "@/lib/incentivos";

type Rule = {
  id: string;
  codigo_contpaqi: string | null;
  match_name_pattern: string | null;
  priority: number;
  category: string;
  points_per_bottle: number;
  notes: string | null;
};

type Unmapped = {
  codigo: string;
  producto_nombre: string;
  bottles: number;
  meses: number;
  primera_venta: string;
  ultima_venta: string;
};

type Exclusion = {
  id: string;
  account_id: string | null;
  client_number: string | null;
  reason: string | null;
  accounts: { business_name: string; client_number: string | null } | null;
};

const num = (n: number) => Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 });

export function GestionIncentivos({
  program,
  rules,
  unmapped,
  exclusions,
}: {
  program: IncentiveProgram;
  rules: Rule[];
  unmapped: Unmapped[];
  exclusions: Exclusion[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [exclNumero, setExclNumero] = useState("");
  const [exclMotivo, setExclMotivo] = useState("");

  // Selección de categoría por código aún sin mapear.
  const [catSel, setCatSel] = useState<Record<string, Category>>({});

  const mapear = async (u: Unmapped) => {
    const category = catSel[u.codigo];
    if (!category) {
      toast.error("Elige una categoría primero");
      return;
    }
    setBusy(u.codigo);
    const { error } = await supabase.from("incentive_product_rules").insert({
      program_id: program.id,
      codigo_contpaqi: u.codigo.toUpperCase().trim(),
      category,
      points_per_bottle: CATEGORY_POINTS[category],
      notes: u.producto_nombre,
    });
    setBusy(null);
    if (error) {
      toast.error("No se pudo mapear", { description: error.message });
      return;
    }
    toast.success(`${u.codigo} → ${category} (${CATEGORY_POINTS[category]} pts/bot)`);
    router.refresh();
  };

  const excluirCodigo = async (u: Unmapped) => {
    setBusy(u.codigo);
    const { error } = await supabase.from("incentive_product_rules").insert({
      program_id: program.id,
      codigo_contpaqi: u.codigo.toUpperCase().trim(),
      category: "Excluido",
      points_per_bottle: 0,
      notes: `No participa en el programa — ${u.producto_nombre}`,
    });
    setBusy(null);
    if (error) {
      toast.error("No se pudo excluir", { description: error.message });
      return;
    }
    toast.success(`${u.codigo} marcado como fuera del programa`);
    router.refresh();
  };

  const borrarRegla = async (r: Rule) => {
    if (!confirm(`¿Eliminar la regla ${r.codigo_contpaqi ?? r.match_name_pattern}?`)) return;
    const { error } = await supabase.from("incentive_product_rules").delete().eq("id", r.id);
    if (error) {
      toast.error("No se pudo eliminar", { description: error.message });
      return;
    }
    toast.success("Regla eliminada");
    router.refresh();
  };

  const agregarExclusion = async () => {
    const numero = exclNumero.trim();
    if (!numero) {
      toast.error("Indica el número de cliente");
      return;
    }
    setBusy("exclusion");
    // Si la cuenta existe en el CRM la ligamos por id (más robusto); si no,
    // queda por número de cliente y aplicará cuando aparezca en ventas.
    const { data: account } = await supabase
      .from("accounts")
      .select("id, business_name")
      .eq("client_number", numero)
      .maybeSingle();
    const { error } = await supabase.from("incentive_exclusions").insert({
      program_id: program.id,
      account_id: account?.id ?? null,
      client_number: numero,
      reason: exclMotivo.trim() || null,
    });
    setBusy(null);
    if (error) {
      toast.error("No se pudo excluir", { description: error.message });
      return;
    }
    toast.success(
      account
        ? `Cliente #${numero} (${account.business_name}) excluido del programa`
        : `Cliente #${numero} excluido (aún no existe en Cuentas; aplicará por número)`,
    );
    setExclNumero("");
    setExclMotivo("");
    router.refresh();
  };

  const borrarExclusion = async (e: Exclusion) => {
    const { error } = await supabase.from("incentive_exclusions").delete().eq("id", e.id);
    if (error) {
      toast.error("No se pudo eliminar", { description: error.message });
      return;
    }
    toast.success("Exclusión eliminada");
    router.refresh();
  };

  const toggleRequirePaid = async () => {
    const { error } = await supabase
      .from("incentive_programs")
      .update({ require_paid: !program.require_paid, updated_at: new Date().toISOString() })
      .eq("id", program.id);
    if (error) {
      toast.error("No se pudo actualizar", { description: error.message });
      return;
    }
    toast.success(
      !program.require_paid
        ? "Los puntos ahora exigen cobranza al corriente (cuenta+mes pagado)"
        : "Los puntos ahora cuentan sobre lo facturado (sin filtro de cobranza)",
    );
    router.refresh();
  };

  const reglasCodigo = rules.filter((r) => r.codigo_contpaqi);
  const reglasPatron = rules.filter((r) => !r.codigo_contpaqi);

  return (
    <div className="space-y-6">
      {/* Configuración del cálculo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Regla de cobranza</CardTitle>
          <CardDescription>
            {program.require_paid
              ? "ACTIVA: las botellas de una cuenta en un mes suman puntos solo cuando todas las facturas de esa cuenta ese mes están pagadas."
              : "INACTIVA: los puntos cuentan sobre lo facturado, sin verificar cobranza (igual que el corte oficial GB)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={toggleRequirePaid}>
            {program.require_paid ? "Cambiar a facturado (sin cobranza)" : "Exigir cobranza"}
          </Button>
        </CardContent>
      </Card>

      {/* Productos GB sin mapear */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Productos {program.provider} vendidos sin mapear{" "}
            {unmapped.length > 0 && <Badge className="ml-1 bg-amber-100 text-amber-800">{unmapped.length}</Badge>}
          </CardTitle>
          <CardDescription>
            Parecen del proveedor (por nombre) pero ninguna regla los cubre: NO están sumando puntos.
            Asígnales categoría, o márcalos fuera del programa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unmapped.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Todo lo vendido del proveedor está mapeado. ✓
            </p>
          ) : (
            <TableScroll>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Código</th>
                    <th className="py-2 pr-3">Producto</th>
                    <th className="py-2 pr-3 text-right">Botellas</th>
                    <th className="py-2 pr-3">Categoría</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {unmapped.map((u) => (
                    <tr key={u.codigo} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{u.codigo}</td>
                      <td className="py-2 pr-3">{u.producto_nombre}</td>
                      <td className="py-2 pr-3 text-right">{num(u.bottles)}</td>
                      <td className="py-2 pr-3">
                        <select
                          className="rounded-md border bg-background px-2 py-1 text-sm"
                          value={catSel[u.codigo] ?? ""}
                          onChange={(e) =>
                            setCatSel((s) => ({ ...s, [u.codigo]: e.target.value as Category }))
                          }
                        >
                          <option value="">Elegir…</option>
                          {CATEGORY_ORDER.map((c) => (
                            <option key={c} value={c}>
                              {c} ({CATEGORY_POINTS[c]} pts)
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" disabled={busy === u.codigo} onClick={() => mapear(u)}>
                            <Plus className="mr-1 h-3.5 w-3.5" /> Mapear
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === u.codigo}
                            onClick={() => excluirCodigo(u)}
                          >
                            No participa
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </CardContent>
      </Card>

      {/* Exclusiones de clientes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Clientes excluidos</CardTitle>
          <CardDescription>
            Sus compras no acumulan puntos (p. ej. el cliente de degustaciones internas “Muestras”).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="No. de cliente (ej. 58)"
              value={exclNumero}
              onChange={(e) => setExclNumero(e.target.value)}
              className="sm:w-44"
            />
            <Input
              placeholder="Motivo (opcional)"
              value={exclMotivo}
              onChange={(e) => setExclMotivo(e.target.value)}
            />
            <Button onClick={agregarExclusion} disabled={busy === "exclusion"}>
              <Plus className="mr-1 h-4 w-4" /> Excluir
            </Button>
          </div>
          {exclusions.length > 0 && (
            <ul className="divide-y rounded-md border">
              {exclusions.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    #{e.accounts?.client_number ?? e.client_number}{" "}
                    <span className="font-medium">{e.accounts?.business_name ?? "(no existe en Cuentas)"}</span>
                    {e.reason && <span className="text-muted-foreground"> — {e.reason}</span>}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => borrarExclusion(e)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Reglas vigentes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Reglas de mapeo vigentes</CardTitle>
          <CardDescription>
            Las reglas por código CONTPAQ ganan siempre sobre las de patrón; entre patrones decide la
            prioridad (mayor gana). “Excluido” = 0 pts (no es del programa).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { titulo: "Por código CONTPAQ", lista: reglasCodigo },
            { titulo: "Por patrón de nombre", lista: reglasPatron },
          ].map(({ titulo, lista }) => (
            <div key={titulo}>
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">{titulo}</p>
              {lista.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin reglas.</p>
              ) : (
                <TableScroll>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="py-1.5 pr-3">{titulo === "Por código CONTPAQ" ? "Código" : "Patrón"}</th>
                        <th className="py-1.5 pr-3">Categoría</th>
                        <th className="py-1.5 pr-3 text-right">Pts/bot</th>
                        <th className="py-1.5 pr-3 text-right">Prioridad</th>
                        <th className="py-1.5 pr-3">Notas</th>
                        <th className="py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-1.5 pr-3 font-mono text-xs">
                            {r.codigo_contpaqi ?? r.match_name_pattern}
                          </td>
                          <td className="py-1.5 pr-3">
                            <Badge variant={r.category === "Excluido" ? "outline" : undefined}>
                              {r.category}
                            </Badge>
                          </td>
                          <td className="py-1.5 pr-3 text-right">{num(r.points_per_bottle)}</td>
                          <td className="py-1.5 pr-3 text-right">{r.priority}</td>
                          <td className="py-1.5 pr-3 max-w-[28ch] truncate text-muted-foreground" title={r.notes ?? ""}>
                            {r.notes}
                          </td>
                          <td className="py-1.5 text-right">
                            <Button variant="ghost" size="sm" onClick={() => borrarRegla(r)}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
