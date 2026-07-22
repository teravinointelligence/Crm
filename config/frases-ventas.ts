// Frases motivacionales de libros y autores clásicos de ventas.
// El Dashboard muestra una por día (rota con el día del año, igual para todo
// el equipo). Para agregar frases basta con extender la lista; el orden importa
// solo para la rotación.

export type FraseVenta = {
  texto: string;
  autor: string;
  /** Libro u obra de donde viene la idea (opcional). */
  fuente?: string;
};

export const FRASES_VENTAS: FraseVenta[] = [
  { texto: "Puedes tener todo lo que quieras en la vida si ayudas a suficientes personas a conseguir lo que ellas quieren.", autor: "Zig Ziglar", fuente: "Secrets of Closing the Sale" },
  { texto: "A la gente no le gusta que le vendan, pero le encanta comprar.", autor: "Jeffrey Gitomer", fuente: "El pequeño libro rojo de las ventas" },
  { texto: "Interésate sincera y genuinamente por los demás.", autor: "Dale Carnegie", fuente: "Cómo ganar amigos e influir sobre las personas" },
  { texto: "Todo lo que la mente puede concebir y creer, lo puede alcanzar.", autor: "Napoleon Hill", fuente: "Piense y hágase rico" },
  { texto: "Hoy multiplicaré mi valor cien veces: persistiré hasta alcanzar el éxito.", autor: "Og Mandino", fuente: "El vendedor más grande del mundo" },
  { texto: "Vender es humano: de una forma u otra, todos nos dedicamos a mover a los demás.", autor: "Daniel H. Pink", fuente: "Vender es humano" },
  { texto: "En las ventas grandes gana quien hace las mejores preguntas, no quien da el mejor discurso.", autor: "Neil Rackham", fuente: "SPIN Selling" },
  { texto: "Los mejores vendedores escuchan el doble de lo que hablan.", autor: "Brian Tracy", fuente: "Psicología de ventas" },
  { texto: "Un “no” no es el final de la conversación: es el comienzo de la negociación.", autor: "Chris Voss", fuente: "Rompe la barrera del no" },
  { texto: "Primero busca comprender, después ser comprendido.", autor: "Stephen R. Covey", fuente: "Los 7 hábitos de la gente altamente efectiva" },
  { texto: "El seguimiento y la constancia convierten los contactos en contratos.", autor: "Grant Cardone", fuente: "Vendes o vendes" },
  { texto: "Cada “no” que recibes te deja un paso más cerca del siguiente “sí”.", autor: "Tom Hopkins", fuente: "Cómo dominar el arte de la venta" },
  { texto: "La gente compra por sus razones, no por las tuyas: descúbrelas antes de ofrecer.", autor: "Zig Ziglar", fuente: "Zig Ziglar Ventas" },
  { texto: "Deja de vender y empieza a ayudar.", autor: "Zig Ziglar", fuente: "Zig Ziglar Ventas" },
  { texto: "Haz un cliente, no una venta.", autor: "Katherine Barchetti" },
  { texto: "No cierres una venta: abre una relación.", autor: "Patricia Fripp" },
  { texto: "Tu actitud, no tu aptitud, determinará tu altitud.", autor: "Zig Ziglar", fuente: "Nos veremos en la cumbre" },
  { texto: "El fracaso es simplemente la oportunidad de comenzar de nuevo, esta vez con más inteligencia.", autor: "Henry Ford" },
  { texto: "La diferencia entre lo ordinario y lo extraordinario es ese pequeño extra.", autor: "Jimmy Johnson" },
  { texto: "Las ventas dependen de la actitud del vendedor, no de la actitud del prospecto.", autor: "W. Clement Stone", fuente: "El sistema infalible para triunfar" },
  { texto: "Cuida a tus clientes, o alguien más lo hará.", autor: "Bob Hooey" },
  { texto: "El secreto de salir adelante es comenzar.", autor: "Mark Twain" },
  { texto: "No he fracasado: he encontrado diez mil maneras que no funcionan.", autor: "Thomas A. Edison" },
  { texto: "La mejor publicidad es la que hacen los clientes satisfechos.", autor: "Philip Kotler", fuente: "Dirección de marketing" },
  { texto: "La calidad de tus preguntas determina la calidad de tus ventas.", autor: "Neil Rackham", fuente: "SPIN Selling" },
  { texto: "Nunca dejes para mañana la llamada que puedes hacer hoy.", autor: "Og Mandino", fuente: "El vendedor más grande del mundo" },
  { texto: "El nombre de una persona es, para ella, el sonido más dulce en cualquier idioma.", autor: "Dale Carnegie", fuente: "Cómo ganar amigos e influir sobre las personas" },
  { texto: "La confianza se gana con pequeñas acciones repetidas todos los días.", autor: "Stephen M. R. Covey", fuente: "La velocidad de la confianza" },
  { texto: "Los clientes no compran productos: compran mejores versiones de sí mismos.", autor: "Donald Miller", fuente: "Cómo construir una StoryBrand" },
  { texto: "El éxito es la suma de pequeños esfuerzos repetidos día tras día.", autor: "Robert Collier" },
  { texto: "Si no cuidas la relación después de la venta, solo hiciste una transacción.", autor: "Jeffrey Gitomer", fuente: "El pequeño libro rojo de las ventas" },
  { texto: "El entusiasmo es contagioso: es difícil decirle que no a alguien que cree en lo que ofrece.", autor: "Frank Bettger", fuente: "Cómo triunfé en ventas" },
  { texto: "Actúa con entusiasmo y serás entusiasta.", autor: "Frank Bettger", fuente: "Cómo triunfé en ventas" },
  { texto: "Ganar no lo es todo, pero querer ganar sí lo es.", autor: "Vince Lombardi" },
  { texto: "La disciplina es el puente entre las metas y los logros.", autor: "Jim Rohn" },
  { texto: "No encuentres clientes para tus productos: encuentra productos para tus clientes.", autor: "Seth Godin", fuente: "Esto es marketing" },
  { texto: "La gente no compra lo que haces, compra por qué lo haces.", autor: "Simon Sinek", fuente: "Empieza con el porqué" },
  { texto: "Cada mañana tienes dos opciones: seguir durmiendo con tus sueños o levantarte a perseguirlos.", autor: "Carlos Slim" },
  { texto: "El mejor momento para prospectar fue ayer; el segundo mejor es hoy.", autor: "Proverbio de ventas" },
  { texto: "Trabaja en silencio y deja que tus resultados hagan el ruido.", autor: "Frank Ocean" },
  { texto: "Una objeción es una petición de más información, no un rechazo.", autor: "Brian Tracy", fuente: "Psicología de ventas" },
  { texto: "Sé tan bueno que no puedan ignorarte.", autor: "Steve Martin" },
];

/**
 * Frase del día: rota con el día del año en horario de Mazatlán, así todo el
 * equipo ve la misma frase y cambia a medianoche local.
 */
export function fraseDelDia(fecha: Date = new Date()): FraseVenta {
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mazatlan",
  }).format(fecha); // YYYY-MM-DD
  const [y, m, d] = dia.split("-").map(Number);
  const dayOfYear = Math.floor(
    (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000,
  );
  return FRASES_VENTAS[(dayOfYear + y) % FRASES_VENTAS.length];
}
