import "server-only";

import { repartoAdmin } from "@/lib/supabase-reparto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  CHOFER_EMAIL_POR_PLAZA,
  PLAZA_LABEL,
  nombresClienteCoinciden,
  resolverPlazaConsistente,
  type PlazaOperativa,
  type UbicacionEntrega,
} from "@/lib/reparto/asignacion-automatica";

type ClienteReparto = {
  id?: string | null;
  nombre?: string | null;
  rfc?: string | null;
  ciudad?: string | null;
  zona?: string | null;
};

type CuentaCRM = {
  business_name: string;
  rfc: string | null;
  region: string | null;
  city: string | null;
  status: string | null;
};

type Chofer = {
  id: string;
  nombre: string;
  email: string | null;
};

export type AsignacionAutomatica = {
  chofer_id: string | null;
  chofer_nombre: string | null;
  plaza: PlazaOperativa | null;
  aplicada: boolean;
  motivo: string;
};

function normalizarRfc(rfc: string | null | undefined): string {
  return (rfc ?? "").toUpperCase().replace(/[^A-Z0-9Ñ&]/g, "");
}

function sinAsignar(motivo: string, plaza: PlazaOperativa | null = null): AsignacionAutomatica {
  return {
    chofer_id: null,
    chofer_nombre: null,
    plaza,
    aplicada: false,
    motivo,
  };
}

/**
 * Crea un resolvedor por petición. Los caches evitan repetir consultas cuando
 * se sube un ZIP con muchas facturas del mismo cliente.
 */
export function crearResolvedorAsignacionAutomatica() {
  const cuentasPorRfc = new Map<string, Promise<{ cuentas: CuentaCRM[]; error: string | null }>>();
  const clientesPorId = new Map<string, Promise<{ cliente: ClienteReparto | null; error: string | null }>>();
  let choferesPromise: Promise<{ choferes: Map<string, Chofer>; error: string | null }> | null = null;

  function cargarChoferes() {
    if (!choferesPromise) {
      const emails = Object.values(CHOFER_EMAIL_POR_PLAZA);
      choferesPromise = (async () => {
        const { data, error } = await repartoAdmin
          .from("usuarios")
          .select("id, nombre, email")
          .eq("activo", true)
          .in("email", emails);
        return {
          choferes: new Map(
            ((data ?? []) as Chofer[])
              .filter((chofer) => chofer.email)
              .map((chofer) => [chofer.email!.toLowerCase(), chofer]),
          ),
          error: error?.message ?? null,
        };
      })();
    }
    return choferesPromise!;
  }

  function cargarCuentas(rfcOriginal: string | null | undefined) {
    const rfc = normalizarRfc(rfcOriginal);
    if (!rfc) return Promise.resolve({ cuentas: [] as CuentaCRM[], error: null });
    const cached = cuentasPorRfc.get(rfc);
    if (cached) return cached;

    const promise = (async () => {
      const { data, error } = await supabaseAdmin()
        .from("accounts")
        .select("business_name, rfc, region, city, status")
        // Los comodines cubren espacios accidentales antes/después del RFC; el
        // filtro normalizado de abajo impide aceptar coincidencias parciales.
        .ilike("rfc", `%${rfc}%`);
      return {
        cuentas: ((data ?? []) as CuentaCRM[]).filter((cuenta) => normalizarRfc(cuenta.rfc) === rfc),
        error: error?.message ?? null,
      };
    })();
    cuentasPorRfc.set(rfc, promise);
    return promise;
  }

  function cargarCliente(clienteId: string) {
    const cached = clientesPorId.get(clienteId);
    if (cached) return cached;
    const promise = (async () => {
      const { data, error } = await repartoAdmin
        .from("clientes")
        .select("id, nombre, rfc, ciudad, zona")
        .eq("id", clienteId)
        .maybeSingle();
      return {
        cliente: (data as ClienteReparto | null) ?? null,
        error: error?.message ?? null,
      };
    })();
    clientesPorId.set(clienteId, promise);
    return promise;
  }

  async function resolver(cliente: ClienteReparto): Promise<AsignacionAutomatica> {
    const { cuentas, error: cuentasError } = await cargarCuentas(cliente.rfc);
    if (cuentasError) return sinAsignar("No se pudo consultar la ubicación de la cuenta en el CRM");

    // Los RFC genéricos pueden pertenecer a varias plazas. Cuando el nombre del
    // cliente identifica una sola cuenta exacta, esa coincidencia desambigua el
    // destino sin depender de la ciudad histórica guardada en Reparto.
    const porNombre = cuentas.filter((cuenta) =>
      nombresClienteCoinciden(cliente.nombre, cuenta.business_name),
    );
    const relacionadas = porNombre.length === 1 ? porNombre : cuentas;

    // Si hay cuentas activas, ignoramos duplicados históricos inactivos. Si no
    // hay ninguna activa, conservamos todas las coincidencias para no adivinar.
    const activas = relacionadas.filter((cuenta) =>
      ["active", "activo"].includes(cuenta.status?.trim().toLowerCase() ?? ""),
    );
    const candidatas = activas.length ? activas : relacionadas;
    const ubicaciones: UbicacionEntrega[] = candidatas.map((cuenta) => ({
      region: cuenta.region,
      ciudad: cuenta.city,
    }));
    const resolucion = resolverPlazaConsistente(ubicaciones, {
      region: cliente.zona,
      ciudad: cliente.ciudad,
    });

    if (resolucion.motivo === "ubicaciones_en_conflicto") {
      return sinAsignar("El RFC coincide con cuentas de ubicaciones distintas; requiere revisión manual");
    }
    if (!resolucion.plaza) {
      return sinAsignar("La ubicación no tiene una regla automática; queda para asignación manual");
    }
    if (resolucion.plaza === "los_cabos") {
      return sinAsignar(
        "Los Cabos: disponible para que un chofer activo tome el pedido",
        "los_cabos",
      );
    }

    const { choferes, error: choferesError } = await cargarChoferes();
    if (choferesError) return sinAsignar("No se pudo consultar a los choferes activos");
    const email = CHOFER_EMAIL_POR_PLAZA[resolucion.plaza];
    const chofer = choferes.get(email);
    if (!chofer) {
      return sinAsignar(`No está disponible el usuario activo de ${PLAZA_LABEL[resolucion.plaza]}`);
    }

    return {
      chofer_id: chofer.id,
      chofer_nombre: chofer.nombre,
      plaza: resolucion.plaza,
      aplicada: true,
      motivo: `${PLAZA_LABEL[resolucion.plaza]} → ${chofer.nombre}`,
    };
  }

  return {
    resolver,
    async resolverPorClienteId(clienteId: string): Promise<AsignacionAutomatica> {
      const { cliente, error } = await cargarCliente(clienteId);
      if (error || !cliente) return sinAsignar("No se pudo consultar la ubicación del cliente de Reparto");
      return resolver(cliente);
    },
  };
}
