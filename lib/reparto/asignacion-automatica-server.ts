import "server-only";

import { repartoAdmin } from "@/lib/supabase-reparto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  CHOFER_EMAIL_POR_PLAZA,
  PLAZA_LABEL,
  resolverPlazaConsistente,
  type PlazaAutomatica,
  type UbicacionEntrega,
} from "@/lib/reparto/asignacion-automatica";

type ClienteReparto = {
  id?: string | null;
  rfc?: string | null;
  ciudad?: string | null;
  zona?: string | null;
};

type CuentaCRM = {
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
  plaza: PlazaAutomatica | null;
  aplicada: boolean;
  motivo: string;
};

function normalizarRfc(rfc: string | null | undefined): string {
  return (rfc ?? "").toUpperCase().replace(/[^A-Z0-9Ñ&]/g, "");
}

function sinAsignar(motivo: string): AsignacionAutomatica {
  return {
    chofer_id: null,
    chofer_nombre: null,
    plaza: null,
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
        .select("rfc, region, city, status")
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
        .select("id, rfc, ciudad, zona")
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

    // Si hay cuentas activas, ignoramos duplicados históricos inactivos. Si no
    // hay ninguna activa, conservamos todas las coincidencias para no adivinar.
    const activas = cuentas.filter((cuenta) => cuenta.status?.toLowerCase() === "active");
    const candidatas = activas.length ? activas : cuentas;
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
