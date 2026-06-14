// Zonas de los portafolios de TERAVINO. Constante compartida entre el server
// (página + API) y los componentes cliente, así que NO lleva `server-only`.
// La BD guarda `zona` como el slug; la UI muestra `nombre`.

export type PortafolioZona = { slug: string; nombre: string };

export const PORTAFOLIO_ZONAS: PortafolioZona[] = [
  { slug: "tijuana", nombre: "Tijuana" },
  { slug: "vallarta", nombre: "Vallarta" },
  { slug: "la-paz", nombre: "La Paz" },
  { slug: "los-cabos", nombre: "Los Cabos" },
];

export function zonaBySlug(slug: string): PortafolioZona | undefined {
  return PORTAFOLIO_ZONAS.find((z) => z.slug === slug);
}

export type PortafolioRow = {
  zona: string;
  nombre_archivo: string | null;
  pdf_url: string;
  storage_path: string;
  size_bytes: number | null;
  updated_at: string;
};
