// Reglas puras para asignar pedidos de Reparto según la ubicación de entrega.
// Se mantienen separadas de Supabase para poder probarlas sin red ni secretos.

export type PlazaAutomatica = "baja_california_norte" | "puerto_vallarta_nayarit" | "la_paz";

export type UbicacionEntrega = {
  region?: string | null;
  ciudad?: string | null;
};

export type ResolucionPlaza = {
  plaza: PlazaAutomatica | null;
  motivo: "ubicacion_reconocida" | "ubicacion_sin_regla" | "ubicaciones_en_conflicto";
};

export const CHOFER_EMAIL_POR_PLAZA: Record<PlazaAutomatica, string> = {
  baja_california_norte: "emmanuel@teravino.com",
  puerto_vallarta_nayarit: "martin@teravino.com",
  la_paz: "mauricio@teravino.com",
};

export const PLAZA_LABEL: Record<PlazaAutomatica, string> = {
  baja_california_norte: "Baja California Norte",
  puerto_vallarta_nayarit: "Puerto Vallarta/Nayarit",
  la_paz: "La Paz",
};

function normalizar(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function contiene(valor: string, opciones: string[]): boolean {
  return opciones.some((opcion) => valor.includes(opcion));
}

function esBajaCaliforniaNorte(valor: string): boolean {
  if (!valor || valor.includes("baja california sur")) return false;
  return (
    contiene(valor, [
      "baja california norte",
      "baja california",
      "tijuana",
      "ensenada",
      "mexicali",
      "tecate",
      "rosarito",
      "san quintin",
      "san felipe",
    ]) || /(^| )(bc|bcn)( |$)/.test(valor)
  );
}

function esPuertoVallartaONayarit(valor: string): boolean {
  return contiene(valor, [
    "puerto vallarta",
    "nuevo vallarta",
    "nuevo nayarit",
    "nayarit",
    "bahia de banderas",
    "punta de mita",
    "bucerias",
    "sayulita",
    "san pancho",
  ]);
}

function esLaPaz(valor: string): boolean {
  return /(^| )la paz( |$)/.test(valor);
}

// Estas ciudades permanecen manuales por autorización expresa. Evita que una
// región amplia llamada "La Paz" absorba entregas fuera de la ciudad.
function esPlazaManualExplicita(valor: string): boolean {
  return contiene(valor, [
    "los cabos",
    "cabo san lucas",
    "san jose del cabo",
    "todos santos",
    "los barriles",
  ]);
}

function detectarEnTexto(valor: string): PlazaAutomatica | null {
  if (esBajaCaliforniaNorte(valor)) return "baja_california_norte";
  if (esPuertoVallartaONayarit(valor)) return "puerto_vallarta_nayarit";
  if (esLaPaz(valor)) return "la_paz";
  return null;
}

/**
 * La ciudad es más específica que la región. Los Cabos, Todos Santos y otras
 * plazas manuales nunca heredan por accidente una región operativa de La Paz.
 */
export function detectarPlazaAutomatica(ubicacion: UbicacionEntrega): PlazaAutomatica | null {
  const ciudad = normalizar(ubicacion.ciudad);
  const region = normalizar(ubicacion.region);

  if (ciudad) {
    if (esPlazaManualExplicita(ciudad)) return null;
    const porCiudad = detectarEnTexto(ciudad);
    if (porCiudad) return porCiudad;
  }

  if (esPlazaManualExplicita(region)) return null;
  return detectarEnTexto(region);
}

/**
 * Varios registros del CRM pueden compartir RFC. Solo asignamos si todos los
 * registros que sí identifican una plaza conducen al mismo chofer.
 */
export function resolverPlazaConsistente(
  ubicaciones: UbicacionEntrega[],
  respaldo?: UbicacionEntrega | null,
): ResolucionPlaza {
  const plazas = new Set(
    ubicaciones
      .map(detectarPlazaAutomatica)
      .filter((plaza): plaza is PlazaAutomatica => Boolean(plaza)),
  );

  if (plazas.size > 1) {
    return { plaza: null, motivo: "ubicaciones_en_conflicto" };
  }
  if (plazas.size === 1) {
    return { plaza: [...plazas][0], motivo: "ubicacion_reconocida" };
  }

  const plazaRespaldo = respaldo ? detectarPlazaAutomatica(respaldo) : null;
  return plazaRespaldo
    ? { plaza: plazaRespaldo, motivo: "ubicacion_reconocida" }
    : { plaza: null, motivo: "ubicacion_sin_regla" };
}
