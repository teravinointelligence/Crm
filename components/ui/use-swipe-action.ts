"use client";

import { useCallback, useRef, useState } from "react";
import { decideAxis } from "@/lib/swipe";

/**
 * Gesto de "deslizar la tarjeta" para acciones rápidas en celular.
 *
 * Hecho con Pointer Events y CSS (sin librerías de gestos). Lo delicado, y la
 * razón de que viva en un hook en vez de copiarse por pantalla:
 *
 *  · Bloqueo de eje: hasta que el dedo se mueve 6px no decide si es un
 *    deslizamiento horizontal o un scroll vertical. Si gana el vertical, el
 *    hook se hace a un lado y la página scrollea normal.
 *  · `touchAction: "pan-y"` para que el navegador siga permitiendo ese scroll.
 *  · Resistencia elástica pasado el umbral, para que se sienta que topa.
 */

export const SWIPE_THRESHOLD = 96;

export type SwipeDirection = "left" | "right";

type Options = {
  /** Acción al soltar pasado el umbral hacia la derecha. */
  onSwipeRight?: () => void;
  /** Acción al soltar pasado el umbral hacia la izquierda. */
  onSwipeLeft?: () => void;
  /** Cuando es false el gesto se ignora (tarea ya cerrada, guardando, etc.). */
  enabled?: boolean;
  threshold?: number;
};

export function useSwipeAction({
  onSwipeRight,
  onSwipeLeft,
  enabled = true,
  threshold = SWIPE_THRESHOLD,
}: Options) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const locked = useRef<"h" | "v" | null>(null);
  const dragXRef = useRef(0);
  // Marca que la acción ya mandó la tarjeta fuera de pantalla: sin esto, el
  // "regresa a su lugar" de onPointerUp cancelaría la animación de salida.
  const flung = useRef(false);
  // Hubo un deslizamiento de verdad: el siguiente clic es un eco del gesto y
  // no la intención de abrir el enlace que quedó debajo del dedo.
  const suppressClick = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const allowRight = Boolean(onSwipeRight);
  const allowLeft = Boolean(onSwipeLeft);

  const move = useCallback((x: number) => {
    dragXRef.current = x;
    setDragX(x);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      start.current = { x: e.clientX, y: e.clientY };
      locked.current = null;
      // Un gesto anterior pudo terminar sin que llegara su clic (el dedo salió
      // de la tarjeta). Se limpia aquí para no matar el toque siguiente.
      suppressClick.current = false;
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || !start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;

      if (locked.current === null) {
        // Umbral y sesgo viven en lib/swipe.ts, probados con npm test.
        const axis = decideAxis(dx, dy);
        if (axis === null) return; // todavía es un toque: deja pasar el clic
        locked.current = axis;
        if (locked.current === "h") {
          // A partir de aquí sí fue un gesto: hay que tragarse el clic que el
          // navegador dispara al soltar, o soltar sobre un enlace navegaría.
          suppressClick.current = true;
          try {
            ref.current?.setPointerCapture(e.pointerId);
          } catch {
            /* algunos navegadores no permiten capturar; el gesto igual funciona */
          }
          setDragging(true);
        }
      }
      if (locked.current !== "h") return;

      e.preventDefault();
      // Recorta hacia el lado que no tiene acción.
      let next = dx;
      if (next > 0 && !allowRight) next = 0;
      if (next < 0 && !allowLeft) next = 0;

      // Pasado el umbral el arrastre se vuelve pesado (resistencia elástica).
      const limit = threshold * 1.6;
      if (Math.abs(next) > limit) {
        const sign = next < 0 ? -1 : 1;
        next = sign * (limit + (Math.abs(next) - limit) * 0.3);
      }
      move(next);
    },
    [enabled, allowLeft, allowRight, threshold, move],
  );

  const onPointerUp = useCallback(() => {
    const wasHorizontal = locked.current === "h";
    start.current = null;
    locked.current = null;
    if (!wasHorizontal) return;
    setDragging(false);

    const x = dragXRef.current;
    flung.current = false;
    if (x >= threshold && allowRight) onSwipeRight?.();
    else if (x <= -threshold && allowLeft) onSwipeLeft?.();
    // Si la acción ya lanzó la tarjeta fuera, no la regreses.
    if (!flung.current) move(0);
  }, [threshold, allowRight, allowLeft, onSwipeRight, onSwipeLeft, move]);

  /** Empuja la tarjeta fuera de pantalla (al completar, antes de que desaparezca). */
  const flingOut = useCallback(
    (direction: SwipeDirection) => {
      const width = ref.current?.offsetWidth ?? 320;
      flung.current = true;
      setDragging(false);
      move(direction === "right" ? width + 24 : -(width + 24));
    },
    [move],
  );

  const reset = useCallback(() => {
    flung.current = false;
    move(0);
  }, [move]);

  return {
    ref,
    dragX,
    dragging,
    /** 0–1 de avance hacia la derecha (para revelar el fondo de acción). */
    revealRight: Math.min(Math.max(dragX, 0) / threshold, 1),
    /** 0–1 de avance hacia la izquierda. */
    revealLeft: Math.min(Math.max(-dragX, 0) / threshold, 1),
    flingOut,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      // En captura, para frenar el clic antes de que llegue al enlace.
      onClickCapture: (e: React.MouseEvent) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    },
    style: {
      transform: `translateX(${dragX}px)`,
      transition: dragging ? "none" : "transform 0.2s ease",
      touchAction: enabled ? ("pan-y" as const) : undefined,
    },
  };
}
