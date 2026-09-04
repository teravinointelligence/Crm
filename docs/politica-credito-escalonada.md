# Política de crédito escalonada

## Regla

Cuando se registra un pago positivo y confirmado para un cliente que tiene una
factura vencida, el CRM reduce automáticamente el plazo de crédito al siguiente
peldaño:

- 60 días → 45 días
- 45 días → 30 días
- 30 días → 15 días
- 15 días → contado (0 días de crédito)

Los acuerdos fuera de esos peldaños bajan al siguiente estándar inferior. Por
ejemplo, 90 días baja a 60; 28 días baja a 15; 7 días baja a contado.

## Cómo se evita un castigo duplicado

Un atraso solo puede reducir el plazo una vez, aunque el cliente haga varios
abonos parciales. Para aplicar una reducción posterior debe vencer una factura
cuya fecha de vencimiento sea posterior al ajuste anterior.

## Alcance

- La regla empieza a operar con los pagos registrados después de instalar la
  migración; no modifica retroactivamente el historial existente.
- Las cuentas marcadas como socios no entran en la reducción automática.
- Las cuentas sin plazo definido y las cuentas que ya están en contado no se
  modifican.
- El ajuste se aplica tanto a pagos manuales como a pagos confirmados desde la
  conciliación bancaria, porque ambos flujos crean un registro de pago.
- Cada cambio queda en `account_credit_adjustments`, con el pago, la factura
  vencida, el plazo anterior y el plazo nuevo.

## Convivencia con la liberación temporal

La regla actual que reconoce durante 30 días el pago completo de una factura
vencida se conserva para cuentas con plazo mayor a cero. Si el cliente ya llegó
a contado, contado prevalece y no se muestra como crédito disponible.
