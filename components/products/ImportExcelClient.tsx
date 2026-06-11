"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImportResultPanel, type ImportOutcome } from "@/components/ui/import-result";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  parseProductsExcel,
  type ProductRowParsed,
  type ParseResult,
} from "@/lib/excel/parseProducts";
import { parseStockExcel, type StockRowParsed } from "@/lib/excel/parseStock";
import { parsePortfolioExcel } from "@/lib/excel/parsePortfolio";
import { createClient } from "@/lib/supabase/client";

type Mode = "catalogo" | "stock" | "portafolio";

export function ImportExcelClient({ repId }: { repId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("stock");
  const [fileName, setFileName] = useState<string | null>(null);
  const [productsPreview, setProductsPreview] = useState<
    ParseResult<ProductRowParsed> | null
  >(null);
  const [stockPreview, setStockPreview] = useState<
    ParseResult<StockRowParsed> | null
  >(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setOutcome(null);
    const buf = await file.arrayBuffer();
    if (mode === "catalogo") {
      const res = await parseProductsExcel(buf);
      setProductsPreview(res);
      setStockPreview(null);
    } else if (mode === "portafolio") {
      const res = await parsePortfolioExcel(buf);
      setProductsPreview(res);
      setStockPreview(null);
    } else {
      const res = await parseStockExcel(buf);
      setStockPreview(res);
      setProductsPreview(null);
    }
  };

  const reset = () => {
    setFileName(null);
    setProductsPreview(null);
    setStockPreview(null);
  };

  const confirmCatalogImport = () => {
    if (!productsPreview) return;
    const { rows, errors } = productsPreview;
    if (!rows.length) {
      toast.error("Sin filas válidas para importar");
      return;
    }
    startTransition(async () => {
      const now = new Date().toISOString();
      // Portfolio import is a price/catalog event, not a stock event — don't
      // overwrite stock_quantity (so a later CONTPAQi stock sync isn't reset).
      const isPortfolio = mode === "portafolio";
      const payload = rows.map((r) => {
        if (isPortfolio) {
          const { stock_quantity: _drop, ...rest } = r;
          return rest;
        }
        return {
          ...r,
          last_stock_update: now,
          last_stock_source: `Excel ${fileName ?? ""}`.trim(),
        };
      });
      const { error } = await supabase
        .from("products")
        .upsert(payload, { onConflict: "sku" });
      if (error) {
        toast.error("Error al importar catálogo", {
          description: error.message,
        });
        return;
      }
      await supabase.from("inventory_imports").insert({
        imported_by: repId,
        import_type: "catalogo_completo",
        source_file_name: fileName,
        rows_total: rows.length + errors.length,
        rows_ok: rows.length,
        rows_error: errors.length,
        error_log: errors as never,
      });
      toast.success(
        isPortfolio
          ? `Portafolio importado: ${rows.length} vinos`
          : `Catálogo importado: ${rows.length} productos`,
      );
      // Resultado persistente (el toast desaparece): filas procesadas + errores.
      setOutcome({
        ok: rows.length,
        okLabel: isPortfolio ? "vinos importados" : "productos importados",
        errors: errors.map((e) => `Fila ${e.row || "?"} — ${e.message}`),
        cta: { href: "/catalogo", label: "Ver catálogo" },
      });
      reset();
      router.refresh();
    });
  };

  const confirmStockImport = () => {
    if (!stockPreview) return;
    const { rows, errors } = stockPreview;
    if (!rows.length) {
      toast.error("Sin filas válidas para importar");
      return;
    }
    startTransition(async () => {
      const now = new Date().toISOString();
      const source = `Excel ${fileName ?? ""}`.trim();
      // Update one by one por SKU. Para volúmenes grandes podríamos usar un RPC,
      // pero ~1000 filas en serial es aceptable.
      const stockErrors: typeof errors = [];
      let ok = 0;
      for (const r of rows) {
        const { error, count } = await supabase
          .from("products")
          .update(
            {
              stock_quantity: r.stock_quantity,
              last_stock_update: now,
              last_stock_source: source,
            },
            { count: "exact" },
          )
          .eq("sku", r.sku);
        if (error) {
          stockErrors.push({ row: 0, message: error.message, raw: r });
        } else if (!count) {
          stockErrors.push({
            row: 0,
            message: `SKU ${r.sku} no encontrado`,
            raw: r,
          });
        } else {
          ok++;
        }
      }
      await supabase.from("inventory_imports").insert({
        imported_by: repId,
        import_type: "solo_stock",
        source_file_name: fileName,
        rows_total: rows.length + errors.length,
        rows_ok: ok,
        rows_error: errors.length + stockErrors.length,
        error_log: [...errors, ...stockErrors] as never,
      });
      if (stockErrors.length) {
        toast.warning(`Importación parcial: ${ok} ok, ${stockErrors.length} errores`);
      } else {
        toast.success(`Stock actualizado en ${ok} productos`);
      }
      // Resultado persistente (el toast desaparece): filas procesadas + errores.
      setOutcome({
        ok,
        okLabel: "productos con stock actualizado",
        errors: [...errors, ...stockErrors].map((e) => (e.row ? `Fila ${e.row} — ${e.message}` : e.message)),
        cta: { href: "/catalogo", label: "Ver catálogo" },
      });
      reset();
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {outcome && <ImportResultPanel outcome={outcome} />}

      <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); reset(); }}>
        <TabsList>
          <TabsTrigger value="stock">Solo stock (uso frecuente)</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo completo</TabsTrigger>
          <TabsTrigger value="portafolio">Portafolio TERAVINO</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <Card>
            <CardContent className="space-y-3 p-6">
              <h3 className="font-display text-lg">Actualizar inventario</h3>
              <p className="text-sm text-muted-foreground">
                Sube un Excel exportado de CONTPAQi con dos columnas:{" "}
                <code className="rounded bg-muted px-1">SKU</code> y{" "}
                <code className="rounded bg-muted px-1">Stock</code>.
              </p>
              <p className="text-xs text-muted-foreground">
                Esto solo actualiza <code className="rounded bg-muted px-1">stock_quantity</code> de los productos existentes — no crea ni modifica nada más.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalogo">
          <Card>
            <CardContent className="space-y-3 p-6">
              <h3 className="font-display text-lg">Importar catálogo completo</h3>
              <p className="text-sm text-muted-foreground">
                Sube un Excel con todas las columnas del catálogo. Los productos se
                hacen <strong>upsert por SKU</strong> (crea nuevos, actualiza
                existentes). Productos no incluidos en el Excel permanecen activos.
              </p>
              <p className="text-xs text-muted-foreground">
                Columnas esperadas: SKU, Nombre, Proveedor, Categoría, Varietal,
                País, Región origen, Vintage, Volumen ml, Precio Base, Stock,
                Activo.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portafolio">
          <Card>
            <CardContent className="space-y-3 p-6">
              <h3 className="font-display text-lg">Portafolio TERAVINO</h3>
              <p className="text-sm text-muted-foreground">
                Sube el portafolio mensual con el formato propio de TERAVINO (agrupado por país / región).
                Detecta automáticamente la fila de encabezados (VINO · REGIÓN · AÑADA · MEDIDA · s/IVA · c/IVA) y
                las filas de sección (p.ej. <em>ALSACIA — Riquewihr · Dopff &amp; Fils</em>) para asignar país / región / bodega
                a los vinos siguientes.
              </p>
              <p className="text-xs text-muted-foreground">
                Genera un SKU estable por vino (<code>slug(nombre)-añada-volumen</code>) y precio base usa <strong>s/IVA</strong>;
                si solo viene c/IVA, divide entre 1.16. La <strong>bodega</strong> se toma de la sección cuando trae <code>·</code>;
                si no, se infiere de la primera palabra del nombre y la editas después si es necesario.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="space-y-3 p-6">
          <label className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-8 text-center cursor-pointer hover:bg-muted/50">
            <FileSpreadsheet className="h-10 w-10 text-brand-carmesi" />
            <span className="font-medium">
              {fileName ? fileName : "Click para subir archivo .xlsx"}
            </span>
            <span className="text-xs text-muted-foreground">
              Máx 10MB · Solo .xlsx
            </span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="hidden"
            />
          </label>
        </CardContent>
      </Card>

      {(productsPreview || stockPreview) && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="font-display text-lg">Preview</h3>
            {productsPreview && (
              <PreviewSummary
                ok={productsPreview.rows.length}
                err={productsPreview.errors.length}
              />
            )}
            {stockPreview && (
              <PreviewSummary
                ok={stockPreview.rows.length}
                err={stockPreview.errors.length}
              />
            )}

            {(productsPreview?.errors.length || stockPreview?.errors.length) ? (
              <details className="rounded-md border bg-amber-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-amber-900">
                  Ver errores
                </summary>
                <ul className="mt-2 space-y-1">
                  {(productsPreview?.errors ?? stockPreview?.errors ?? []).map(
                    (e, i) => (
                      <li key={i} className="text-xs text-amber-900">
                        Fila {e.row || "?"} — {e.message}
                      </li>
                    ),
                  )}
                </ul>
              </details>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset} disabled={pending}>
                Cancelar
              </Button>
              <Button
                onClick={
                  mode === "stock" ? confirmStockImport : confirmCatalogImport
                }
                disabled={
                  pending ||
                  (mode === "stock"
                    ? !stockPreview?.rows.length
                    : !productsPreview?.rows.length)
                }
              >
                {pending ? "Importando…" : "Confirmar import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6 text-sm">
          <h3 className="font-display text-lg">Plantillas</h3>
          <p className="mt-1 text-muted-foreground">
            Descarga el formato base si lo necesitas:
          </p>
          <ul className="mt-2 space-y-1">
            <li>
              <Link
                href="/templates/plantilla_stock.csv"
                className="text-brand-carmesi hover:underline"
              >
                plantilla_stock.csv
              </Link>
            </li>
            <li>
              <Link
                href="/templates/plantilla_productos.csv"
                className="text-brand-carmesi hover:underline"
              >
                plantilla_productos.csv
              </Link>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewSummary({ ok, err }: { ok: number; err: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border bg-emerald-50 p-4">
        <div className="flex items-center gap-2 text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          <span className="font-medium">{ok} filas válidas</span>
        </div>
      </div>
      <div
        className={`rounded-md border p-4 ${
          err ? "bg-amber-50 text-amber-900" : "bg-muted/30 text-muted-foreground"
        }`}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">{err} con errores</span>
        </div>
      </div>
    </div>
  );
}
