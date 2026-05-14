"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

const CARMESI = "#A91E3A";
const ORO = "#c9a96e";

export type SeriesDatum = { label: string; value: number };

export function CategoryBarChart({
  title,
  subtitle,
  data,
  emptyText = "Sin datos en el periodo seleccionado.",
  color = CARMESI,
  altColor = ORO,
  formatValue = formatCurrency,
}: {
  title: string;
  subtitle?: string;
  data: SeriesDatum[];
  emptyText?: string;
  color?: string;
  altColor?: string;
  formatValue?: (n: number) => string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div>
          <h3 className="font-display text-lg">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#E8DDC8" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7A6E70" }} interval={0} angle={data.length > 4 ? -25 : 0} textAnchor={data.length > 4 ? "end" : "middle"} height={data.length > 4 ? 60 : 30} />
                <YAxis tick={{ fontSize: 11, fill: "#7A6E70" }} tickFormatter={(v) => (typeof v === "number" ? formatCompact(v) : String(v))} width={64} />
                <Tooltip
                  cursor={{ fill: "rgba(169,30,58,0.08)" }}
                  formatter={(v: number) => formatValue(v)}
                  labelStyle={{ color: "#1F1A1C" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #E8DDC8", fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={i % 2 === 0 ? color : altColor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MonthlyBarChart({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: SeriesDatum[];
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div>
          <h3 className="font-display text-lg">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#E8DDC8" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7A6E70" }} />
              <YAxis tick={{ fontSize: 11, fill: "#7A6E70" }} tickFormatter={(v) => (typeof v === "number" ? formatCompact(v) : String(v))} width={64} />
              <Tooltip
                cursor={{ fill: "rgba(201,169,110,0.15)" }}
                formatter={(v: number) => formatCurrency(v)}
                contentStyle={{ borderRadius: 8, border: "1px solid #E8DDC8", fontSize: 12 }}
              />
              <Bar dataKey="value" fill={CARMESI} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}
