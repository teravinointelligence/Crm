"use client";

// Importador de "proveedor por producto": el admin sube un Excel (identificador
// del producto + proveedor) y se escribe en products.supplier, que es el campo
// con el que se agrupan las sugerencias de reabasto. Revisa antes de aplicar.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableScroll } from "@/components/ui/table-scroll";
import { createClient } from "@/lib/supabase/client";
import { parseProveedoresExcel } from "@/lib/excel/parseProveedores";
import { matchProveedorRows, type ProveedorMatch } from "@/lib/proveedor-map";

const VIA_BADGE: Record<ProveedorMatch["via"], { label: string; variant: "success" | "warning" | "muted" }> = {
  sku: { label: "SKU exacto", variant: "success" },
  codigo: { label: "Código exacto", variant: "success" },
  nombre: { label: "Nombre exacto", variant: "success" },
  fuzzy: { label: "Similar (revisar)", variant: "warning" },
  none: { label: "Sin match", variant: "muted" },
};

export function ProveedorImportClient() {
  const router = useRouter();
  const supabase = createClient();
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [matches, setMatches] = useState<ProveedorMatch[] | null>(null);
  const [detected, setDetected] = useState<{ proveedor: string | null; sku: string | null; codigo: string | null; nombre: string | null } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setMatches(null);
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parseProveedoresExcel(buf);
      if (parsed.errors.length && !parsed.rows.length) {
        setError(parsed.errors[0].message);
        return;
      }
      setDetected(parsed.detected);

      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id, sku, name, codigo_contpaqi, supplier");
      if (pErr) throw new Error(pErr.message);

      const result = matchProveedorRows({ products: products ?? [], rows: parsed.rows });
      setMatches(result);
      // Pre-marca los exactos que cambian el proveedor; los fuzzy a revisión manual.
      setSelected(new Set(result.filter((m) => m.product_id && m.score === 1 && m.changes).map((m) => m.key)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar el archivo.");
    } finally {
      setLoading(false);
    }
  };

  const matchable = useMemo(() => (matches ?? []).filter((m) => m.product_id), [matches]);
  const noneCount = (matches?.length ?? 0) - matchable.length;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const apply = async () => {
    const chosen = matchable.filter((m) => selected.has(m.key) && m.product_id);
    if (!chosen.length) {
      toast.error("No hay productos seleccionados.");
      return;
    }
    setApplying(true);
    try {
      let ok = 0;
      for (let i = 0; i < chosen.length; i += 20) {
        const chunk = chosen.slice(i, i + 20);
        const results = await Promise.all(
          chunk.map((m) =>
            supabase.from("products").update({ supplier: m.proveedor }).eq("id", m.product_id!),
          ),
        );
        ok += results.filter((r) => !r.error).length;
      }
      toast.success(`${ok} producto(s) actualizados con su proveedor.`);
      router.refresh();
      setMatches(null);
      setFileName(null);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al aplicar.");
    } finally {
      setApplying(false);
    }
  };

  const exactChanges = matchable.filter((m) => m.score === 1 && m.changes).length;
  const fuzzyCount = matchable.filter((m) => m.via === "fuzzy").length;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 py-5">
          <label className="flex cursor-pointer items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
              <Upload className="h-4 w-4" /> Subir archivo de proveedores (.xlsx)
            </span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </label>
          <p className="text-xs text-muted-foreground">
            El archivo necesita una columna <b>Proveedor</b> y otra para identificar el producto:
            <b> SKU</b>, <b>Código</b> (CONTPAQ) o <b>Nombre</b>. Tip: exporta el catálogo, agrega
            la columna Proveedor y vuelve a subirlo.
          </p>
          {detected && (
            <p className="text-xs text-muted-foreground">
              Columnas: proveedor = <b>{detected.proveedor ?? "—"}</b> · sku = <b>{detected.sku ?? "—"}</b> ·
              código = <b>{detected.codigo ?? "—"}</b> · nombre = <b>{detected.nombre ?? "—"}</b>
            </p>
          )}
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p>
          )}
        </CardContent>
      </Card>

      {matches && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
              <p className="mr-auto text-sm text-muted-foreground">
                {matches.length} filas · {exactChanges} cambios exactos · {fuzzyCount} similares · {noneCount} sin match
              </p>
              <span className="text-sm">
                <span className="font-medium text-foreground">{selected.size}</span> seleccionados
              </span>
              <Button onClick={apply} disabled={applying || !selected.size}>
                {applying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Tags className="mr-1 h-4 w-4" />}
                Aplicar proveedores
              </Button>
            </CardContent>
          </Card>

          <TableScroll>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-2 py-2">Producto del catálogo</th>
                  <th className="px-2 py-2">Proveedor actual</th>
                  <th className="px-2 py-2">Proveedor nuevo</th>
                  <th className="px-2 py-2">Match</th>
                </tr>
              </thead>
              <tbody>
                {matchable.map((m) => {
                  const v = VIA_BADGE[m.via];
                  const isSel = selected.has(m.key);
                  return (
                    <tr key={m.key} className={`border-b last:border-0 align-top ${isSel ? "bg-accent/10" : ""}`}>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-brand-carmesi"
                          checked={isSel}
                          onChange={() => toggle(m.key)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{m.productName}</div>
                        <div className="text-xs text-muted-foreground">{m.productSku}</div>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{m.currentSupplier?.trim() || "—"}</td>
                      <td className="px-2 py-2">
                        <span className="font-medium">{m.proveedor}</span>
                        {!m.changes && <span className="ml-1 text-xs text-muted-foreground">(sin cambio)</span>}
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant={v.variant}>{v.label}</Badge>
                        {m.via === "fuzzy" && (
                          <span className="ml-1 text-xs text-muted-foreground">{Math.round(m.score * 100)}%</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>

          {noneCount > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              {noneCount} fila(s) del archivo no se pudieron emparejar con ningún producto. Revisa el
              SKU/código/nombre y reintenta.
            </p>
          )}
        </>
      )}
    </div>
  );
}
