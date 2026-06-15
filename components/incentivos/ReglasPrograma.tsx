// Reglas del programa + escala de puntos por vino. Sección compartida entre
// la página del vendedor y el dashboard del equipo: es la "letra chica" que
// el vendedor consulta desde el celular para saber qué vender y cómo suma.

import { ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  CATEGORY_EXAMPLES,
  CATEGORY_ORDER,
  CATEGORY_POINTS,
  type IncentiveProgram,
} from "@/lib/incentivos";

const fecha = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

export function ReglasPrograma({ program }: { program: IncentiveProgram }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="h-4 w-4 text-carmesi" /> Reglas del programa y escala de puntos
        </CardTitle>
        <CardDescription>
          {program.name} · del {fecha(program.start_date)} al {fecha(program.end_date)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Escala de puntos por categoría de vino */}
        <TableScroll>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Categoría</th>
                <th className="py-2 pr-3 text-right whitespace-nowrap">Pts/botella</th>
                <th className="py-2">Vinos</th>
              </tr>
            </thead>
            <tbody>
              {[...CATEGORY_ORDER].reverse().map((cat) => (
                <tr key={cat} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 font-medium text-carmesi whitespace-nowrap">{cat}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{CATEGORY_POINTS[cat]}</td>
                  <td className="py-2 text-muted-foreground">{CATEGORY_EXAMPLES[cat]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>

        {/* Reglas */}
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Suman puntos las botellas Gerard Bertrand <span className="font-medium text-foreground">vendidas a tus clientes</span> dentro
            de la vigencia (cuentan desde el 1 de enero).
          </li>
          {program.require_paid && (
            <li>
              Solo cuentan ventas <span className="font-medium text-foreground">facturadas y cobradas</span>: las botellas de un mes se
              confirman cuando la cobranza de ese cliente en ese mes está al corriente. Mientras tanto se muestran como
              &ldquo;en camino&rdquo;.
            </li>
          )}
          <li>Las degustaciones y muestras internas (clientes excluidos del programa) no acumulan puntos.</li>
          <li>Las devoluciones y notas de crédito restan los puntos correspondientes.</li>
          <li>
            Los niveles son <span className="font-medium text-foreground">acumulables</span>: alcanzar uno gana esa recompensa además de
            las anteriores. Las recompensas las financia {program.provider} al 100%.
          </li>
          <li>La proyección a diciembre es tu ritmo actual (puntos ÷ meses transcurridos × 12); es estimación, no promesa.</li>
        </ul>
      </CardContent>
    </Card>
  );
}
