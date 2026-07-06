import type { StoryPerspective, WorldEra } from "./types";

// Mundos sellados: cada uno fija UN ambiente central y reglas inmutables.
// Las reglas NO se muestran al jugador al entrar — viajan al narrador y se
// descubren jugando. El tagline es lo único que el jugador ve: intriga sin spoiler.
export const worldEras: WorldEra[] = [
  {
    id: "veldaran",
    name: "Veldaran, la Ciudad de los Sellos",
    era: "Fantasía medieval",
    tagline: "Una ciudad donde ser monstruo es legal, pero parecerlo es fatal.",
    ambience: "Ciudad amurallada de niebla y tinta: los licántropos son ciudadanos registrados bajo el Pacto de Plata, la Guardia del Umbral administra la magia como si fuera aduana, y la Mano de Bronce cobra refugios en favores.",
    worldRules: [
      "El Pacto de Plata es la ley: tener o no tener el sello no define quién es el monstruo.",
      "La Guardia del Umbral tiene el monopolio de la magia y de los seres registrados.",
      "La Mano de Bronce no es un ejército: es una red de refugio que cobra en favores.",
      "Un sello roto no se perdona: se hereda."
    ],
    forgeSeasoning: "Intriga urbana con injusticia legal y reloj nocturno. La ciudad es un personaje: sellos, archivos, tribunales, callejones con memoria.",
    authoredCampaignId: "luna-roja",
    entry: {
      exterior: "Llegás con la última caravana antes del cierre de puertas: nadie te conoce y el sello de visitante ya te marca.",
      interior: "Naciste entre estos muros y esta noche descubrís que un papel con tu nombre dice algo que no firmaste."
    }
  },
  {
    id: "marea-ceniza",
    name: "La Marea de Ceniza",
    era: "Distopía apocalíptica",
    tagline: "El mundo terminó hace veinte años. Lo raro es que alguien siga mintiendo sobre cómo.",
    ambience: "Caravanas-ciudad que cruzan un mar de ceniza gris; el agua limpia es moneda, los mapas viejos son contrabando y cada campamento vota sus propias leyes al caer el sol.",
    worldRules: [
      "El agua limpia vale más que la verdad, y las dos se racionan.",
      "Nadie viaja de noche: la ceniza escucha y repite lo que oye.",
      "Recordar el mundo viejo en voz alta es deuda: alguien siempre cobra ese recuerdo.",
      "Las caravanas votan todo; los muertos de la ruta también cuentan como votos."
    ],
    forgeSeasoning: "Supervivencia con política de caravana: escasez, trueques crueles, tecnología oxidada semiviva y un secreto sobre cómo terminó el mundo.",
    entry: {
      exterior: "Tu caravana se hundió en la ceniza hace tres días: entrás a este campamento con las manos vacías y un mapa que no deberías tener.",
      interior: "Sos parte de esta caravana desde siempre, y anoche el consejo votó algo con tu nombre sin invitarte a la fogata."
    }
  },
  {
    id: "islas-juramento",
    name: "Las Islas del Juramento",
    era: "Mitológico antiguo",
    tagline: "Acá los dioses existen, cobran favores, y ninguno da recibo.",
    ambience: "Un archipiélago arcaico de templos con siesta, oráculos con lista de espera y dioses menores que se meten en los pleitos vecinales; cada juramento pesa físicamente, y el clima se ofende.",
    worldRules: [
      "Todo favor de un dios se paga con memoria propia: primero lo chico, después los nombres.",
      "Romper un juramento cambia el clima de la isla donde se rompió.",
      "Los muertos opinan en los tribunales, pero solo si alguien vivo les presta la voz.",
      "Ningún dios puede mentir de frente; por eso todos hablan de costado."
    ],
    forgeSeasoning: "Mitológico mediterráneo con humor seco: dioses mezquinos, burocracia sagrada, profecías mal archivadas y deudas que se heredan por parte de madre.",
    entry: {
      exterior: "Tu barco encalló donde el oráculo dijo que encallaría: te esperan hace tres días y ya te cobraron la estadía.",
      interior: "Serviste toda tu vida en el templo chico de tu isla, hasta que hoy tu dios te habló por primera vez… para pedirte disculpas."
    }
  }
];

export const defaultWorldId = worldEras[0].id;

export function worldById(id: string | null | undefined): WorldEra {
  return worldEras.find((world) => world.id === id) ?? worldEras[0];
}

export function perspectiveEntryLine(world: WorldEra, perspective: StoryPerspective): string {
  return perspective === "interior" ? world.entry.interior : world.entry.exterior;
}
