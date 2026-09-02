// Decisión de eje de un gesto: ¿esto fue deslizar, hacer scroll, o solo tocar?
//
// Vive aparte del hook (y sin React) para poder probarlo con `npm test`. No es
// un detalle cosmético: cuando el umbral era de 6 px, un toque con el pulgar
// sobre el nombre del cliente se movía lo suficiente para contar como
// deslizamiento, la tarjeta capturaba el puntero y el clic del enlace nunca
// llegaba. Los enlaces dentro de las tarjetas parecían muertos.

/**
 * Cuánto tiene que moverse el dedo para que deje de ser un toque. Generoso a
 * propósito: un pulgar se desplaza 6–10 px sin que la persona lo note.
 */
export const ACTIVATE_PX = 14;

/**
 * Qué tanto tiene que dominar lo horizontal para que gane al scroll. Ante la
 * duda gana el vertical, que es lo que la gente hace más seguido.
 */
export const HORIZONTAL_BIAS = 1.5;

export type SwipeAxis = "h" | "v" | null;

/**
 * `null` = todavía no es nada (fue un toque, deja pasar el clic).
 * `"h"` = deslizamiento horizontal. `"v"` = scroll vertical.
 */
export function decideAxis(dx: number, dy: number): SwipeAxis {
  if (Math.abs(dx) < ACTIVATE_PX && Math.abs(dy) < ACTIVATE_PX) return null;
  return Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS ? "h" : "v";
}
