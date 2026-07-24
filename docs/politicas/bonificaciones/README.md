# Política de bonificaciones — solo sobre factura pagada

Vigente desde el **24 de julio de 2026**.

La regla: las bonificaciones de las promociones (ej. 5+1) se entregan únicamente
cuando la factura del pedido está **pagada**. El pago se confirma de dos formas:

1. **Comprobante del cliente** — se registra el pago en Cartera y la bonificación
   se libera para el siguiente reparto.
2. **Corte mensual** — en la conciliación de fin de mes, toda factura que quede
   pagada libera su bonificación pendiente.

Los pedidos anteriores a la vigencia conservan las condiciones con las que se
vendieron.

## Archivos

- `TERAVINO_Politica_Bonificaciones.pdf` — cápsula de una hoja para el equipo de
  ventas (formato oficial de cápsulas del CRM).
- `politica_bonificaciones.json` — contenido de la cápsula (fuente editable).
- `generar_capsulas.py` — generador; para regenerar el PDF:

  ```bash
  python3 generar_capsulas.py politica_bonificaciones.json TERAVINO_Politica_Bonificaciones.pdf
  ```

  Requiere `reportlab`.
