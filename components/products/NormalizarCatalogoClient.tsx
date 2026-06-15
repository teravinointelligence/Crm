"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, CheckCircle2, AlertTriangle, RefreshCw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/catalogo/normalize.mjs";
import {
  NORM_FIELD_LABEL,
  type ApprovedChange,
  type Confidence,
  type NormalizeReport,
  type NormField,
  type SuggestionSource,
} from "@/lib/catalogo/types";

// Una fila editable de la tabla (aplanada desde el reporte).
type Row = {
  key: string;
  product_id: string;
  sku: string | null;
  name: string;
  supplier: string | null;
  field: NormField;
  current: string | number | null;
  suggested: string | number | null; // null = ambigua, requiere IA o elección manual
  confidence: Confidence | null;
  source: SuggestionSource;
  reason: string;
};

const CONF_VARIANT: Record<Confidence, "success" | "warning" | "muted"> = {
  alta: "success",
  media: "warning",
  baja: "muted",
};

function formatValue(field: NormField, value: string | number | null): string {
  if (value === null || value === "") return "—";
  if (field === "category") return CATEGORY_LABEL[value as keyof typeof CATEGORY_LABEL] ?? String(value);
  if (field === "volume_ml") {
    const ml = Number(value);
    return ml >= 1000 && ml % 1000 === 0 ? `${ml / 1000} L` : `${ml} ml`;
  }
  return String(value);
}

export function NormalizarCatalogoClient() {
  const router = useRouter();
  const [report, setReport] = useState<NormalizeReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Selección, ediciones inline de categoría y sugerencias de IA por producto.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({}); // key → categoría elegida
  const [llmByProduct, setLlmByProduct] = useState<
    Record<string, { category: string; confidence: Confidence; reason: string }>
  >({});
  const [runningLlm, setRunningLlm] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/catalogo/normalizar", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el catálogo.");
      setReport(data as NormalizeReport);
      setSelected(new Set());
      setEdits({});
      setLlmByProduct({});
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // --- Aplana el reporte en filas editables, por campo --------------------
  const rows = useMemo<Row[]>(() => {
    if (!report) return [];
    const out: Row[] = [];
    for (const p of report.analyzed) {
      const base = { product_id: p.product_id, sku: p.sku, name: p.name, supplier: p.supplier };
      // Sugerencias por reglas (cualquier campo).
      for (const s of p.suggestions) {
        out.push({
          key: `${p.product_id}:${s.field}`,
          ...base,
          field: s.field,
          current: s.current,
          suggested: s.suggested,
          confidence: s.confidence,
          source: s.source,
          reason: s.reason,
        });
      }
      // Categoría ambigua sin sugerencia de reglas: fila de categoría con IA
      // (si ya la pedimos) o vacía (a la espera de IA / elección manual).
      const hasCatSuggestion = p.suggestions.some((s) => s.field === "category");
      if (p.categoryAmbiguous && !hasCatSuggestion) {
        const llm = llmByProduct[p.product_id];
        out.push({
          key: `${p.product_id}:category`,
          ...base,
          field: "category",
          current: p.category,
          suggested: llm ? llm.category : null,
          confidence: llm ? llm.confidence : null,
          source: llm ? "llm" : "rules",
          reason: llm ? llm.reason : "Sin señal en el nombre — sugiere con IA o elige manualmente.",
        });
      }
    }
    return out;
  }, [report, llmByProduct]);

  const rowsByField = useMemo(() => {
    const groups: Record<NormField, Row[]> = {
      category: [], country: [], varietal: [], vintage: [], volume_ml: [],
    };
    for (const r of rows) groups[r.field].push(r);
    return groups;
  }, [rows]);

  // Productos ambiguos aún sin sugerencia de IA (para el botón de IA).
  const ambiguousPendingIds = useMemo(
    () =>
      rows
        .filter((r) => r.field === "category" && r.suggested === null && !llmByProduct[r.product_id])
        .map((r) => r.product_id),
    [rows, llmByProduct],
  );

  // Valor que se aplicaría para una fila (con edición inline para categoría).
  const effectiveValue = useCallback(
    (r: Row): string | number | null => {
      if (r.field === "category") return edits[r.key] ?? r.suggested;
      return r.suggested;
    },
    [edits],
  );

  const effectiveSource = useCallback(
    (r: Row): SuggestionSource | "manual" => {
      if (r.field === "category" && edits[r.key] && edits[r.key] !== r.suggested) return "manual";
      return r.source;
    },
    [edits],
  );

  // --- Selección -----------------------------------------------------------
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const selectableKeys = useMemo(
    () => rows.filter((r) => effectiveValue(r) !== null).map((r) => r.key),
    [rows, effectiveValue],
  );

  const selectAll = () => setSelected(new Set(selectableKeys));
  const selectHighConfidence = () =>
    setSelected(new Set(rows.filter((r) => r.confidence === "alta" && effectiveValue(r) !== null).map((r) => r.key)));
  const clearSelection = () => setSelected(new Set());

  // --- IA para ambiguos ----------------------------------------------------
  const runLlm = async () => {
    if (!ambiguousPendingIds.length) return;
    setRunningLlm(true);
    try {
      const res = await fetch("/api/catalogo/normalizar/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product_ids: ambiguousPendingIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "La IA no respondió.");
      const next: typeof llmByProduct = {};
      for (const s of data.suggestions ?? []) {
        next[s.product_id] = { category: s.category, confidence: s.confidence, reason: `IA: ${s.reason}` };
      }
      setLlmByProduct((prev) => ({ ...prev, ...next }));
      toast.success(`IA sugirió ${Object.keys(next).length} categoría(s). Revísalas antes de aplicar.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al consultar la IA.");
    } finally {
      setRunningLlm(false);
    }
  };

  // --- Aplicar -------------------------------------------------------------
  const apply = async () => {
    const changes: ApprovedChange[] = [];
    for (const r of rows) {
      if (!selected.has(r.key)) continue;
      const value = effectiveValue(r);
      if (value === null) continue;
      changes.push({
        product_id: r.product_id,
        field: r.field,
        value,
        source: effectiveSource(r) as SuggestionSource,
        confidence: r.confidence ?? "media",
      });
    }
    if (!changes.length) {
      toast.error("No hay cambios seleccionados.");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/catalogo/normalizar/aplicar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron aplicar los cambios.");
      toast.success(`${data.applied} cambio(s) aplicados al catálogo.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al aplicar.");
    } finally {
      setApplying(false);
    }
  };

  // --- Render --------------------------------------------------------------
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="outline" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!report || !rows.length) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="El catálogo está limpio"
        description={`Revisé ${report?.total ?? 0} productos y no encontré categorías ni datos que normalizar.`}
        action={
          <Button variant="outline" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> Volver a revisar
          </Button>
        }
      />
    );
  }

  const selectedCount = selected.size;

  return (
    <div className="space-y-5">
      {/* Barra de acciones */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <p className="mr-auto text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{report.total}</span> productos revisados ·{" "}
            <span className="font-medium text-foreground">{rows.length}</span> sugerencias ·{" "}
            <span className="font-medium text-foreground">{report.ambiguousCount}</span> ambiguas
          </p>
          <Button size="sm" variant="outline" onClick={selectHighConfidence}>
            Seleccionar alta confianza
          </Button>
          <Button size="sm" variant="outline" onClick={selectAll}>
            Seleccionar todo
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} disabled={!selectedCount}>
            Limpiar
          </Button>
          <Button size="sm" onClick={apply} disabled={!selectedCount || applying}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {applying ? "Aplicando…" : `Aplicar ${selectedCount || ""} cambio(s)`}
          </Button>
        </CardContent>
      </Card>

      {/* Aviso de IA para ambiguos */}
      {ambiguousPendingIds.length > 0 && (
        <Card className="border-accent/40 bg-accent/5">
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <Sparkles className="h-5 w-5 text-brand-carmesi" />
            <p className="mr-auto text-sm text-muted-foreground">
              Hay <span className="font-medium text-foreground">{ambiguousPendingIds.length}</span> productos
              cuya categoría no se pudo deducir por reglas. Puedes pedir una sugerencia a la IA (la revisas igual antes de aplicar).
            </p>
            <Button size="sm" variant="accent" onClick={runLlm} disabled={runningLlm}>
              <Wand2 className="mr-2 h-4 w-4" />
              {runningLlm ? "Consultando IA…" : `Sugerir con IA (${ambiguousPendingIds.length})`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Secciones por campo (Categoría primero) */}
      {(Object.keys(rowsByField) as NormField[]).map((field) => {
        const list = rowsByField[field];
        if (!list.length) return null;
        return (
          <section key={field} className="space-y-2">
            <h2 className="font-display text-lg">
              {NORM_FIELD_LABEL[field]}{" "}
              <span className="text-sm font-normal text-muted-foreground">({list.length})</span>
            </h2>
            <TableScroll>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-10 px-3 py-2"></th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Actual</th>
                    <th className="px-3 py-2">Sugerido</th>
                    <th className="px-3 py-2">Confianza</th>
                    <th className="px-3 py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const value = effectiveValue(r);
                    const disabled = value === null;
                    const isSelected = selected.has(r.key);
                    return (
                      <tr
                        key={r.key}
                        className={`border-b last:border-0 ${isSelected ? "bg-accent/10" : ""}`}
                      >
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-brand-carmesi disabled:opacity-40"
                            checked={isSelected}
                            disabled={disabled}
                            onChange={() => toggle(r.key)}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.sku ? `${r.sku} · ` : ""}
                            {r.supplier ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-muted-foreground">
                          {formatValue(r.field, r.current)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {r.field === "category" ? (
                            <Select
                              value={(value as string) ?? ""}
                              onValueChange={(v) => {
                                setEdits((prev) => ({ ...prev, [r.key]: v }));
                                // Al elegir manualmente una ambigua, la marcamos seleccionable/seleccionada.
                                setSelected((prev) => new Set(prev).add(r.key));
                              }}
                            >
                              <SelectTrigger className="h-8 w-[170px]">
                                <SelectValue placeholder="Elegir…" />
                              </SelectTrigger>
                              <SelectContent>
                                {(CATEGORIES as string[]).map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="font-medium">{formatValue(r.field, value)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-col gap-1">
                            {r.confidence ? (
                              <Badge variant={CONF_VARIANT[r.confidence]}>{r.confidence}</Badge>
                            ) : (
                              <Badge variant="muted">sin dato</Badge>
                            )}
                            <Badge variant={effectiveSource(r) === "rules" ? "outline" : "accent"}>
                              {effectiveSource(r) === "rules" ? "regla" : effectiveSource(r) === "llm" ? "IA" : "manual"}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                          {r.reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </section>
        );
      })}
    </div>
  );
}
