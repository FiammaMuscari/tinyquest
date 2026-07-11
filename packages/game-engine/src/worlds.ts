import type { StoryPerspective, WorldEra } from "./types";

// Mundos sellados: cada uno fija UN ambiente central y reglas inmutables.
// Las reglas NO se muestran al jugador al entrar — viajan al narrador y se
// descubren jugando. El tagline es lo único que el jugador ve: intriga sin spoiler.
export const worldEras: WorldEra[] = [
  {
    id: "veldaran",
    name: "Veldaran, la Ciudad de los Sellos",
    era: "Fantasía medieval oriental",
    tagline: "La ciudad de los magos más poderosos de tres mundos, donde subir de nivel cuesta más que sangre.",
    ambience: "Metrópoli mágica medieval-oriental bajo doce lunas: humanos, humanoides, bestias bípedas y animales parlantes conviven como magos, estudiantes, mercaderes y asesinos. El poder se ordena en cinco sellos —junior, medio, maestro, hunter, predator— y los Hunters son la policía mágica que hace cumplir la única ley sagrada: nada de violencia abierta dentro de las murallas.",
    worldRules: [
      "Iniciar violencia o revuelta dentro de las murallas es el único crimen imperdonable: los Hunters lo cobran al instante, sin juicio.",
      "El poder se mide en cinco sellos —junior, medio, maestro, hunter, predator—: no es solo fuerza sino chi, y cada sello se gana ante testigos.",
      "Humanos, humanoides, bestias bípedas y animales parlantes valen lo mismo ante el sello: manda el chi, no la sangre ni la raza.",
      "Un Predator ya no pelea: en el sello máximo comercia y delibera telepáticamente con las otras razas sobre el futuro de la humanidad.",
      "Las armas malditas existen, recuerdan a cada dueño y portarlas sin el sello que las doma es sentencia.",
      "Los tres mundos comparten la misma escala de cinco sellos, y bajo las doce lunas se abren los portales que los unen: la política de Veldaran es la política del universo."
    ],
    forgeSeasoning: "Intriga política estilo Juego de Tronos en una metrópoli mágica medieval-oriental multirraza: academias de magia, gremios de Hunters, castas de sellos, armas malditas, telepatía entre razas y consejos de Predators sobre el destino de la humanidad. La violencia abierta está prohibida, así que los conflictos se libran en favores, duelos rituales, secretos y ascensos. Puede haber sangre al estilo Game of Thrones, nunca gore extremo. REGISTRO DE NOMBRES: apellidos con guiño inglés, de una sola palabra (Ashcombe, Morvane, Dunwyn, Blackwood, Ashford, Vayne).",
    entry: {
      exterior: "Cruzás uno de los doce portales lunares con el sello de otro mundo cosido al brazo: en Veldaran sos apenas un junior sin nombre entre magos que podrían borrarte con un pensamiento.",
      interior: "Creciste en las academias de Veldaran esperando tu primer sello; esta noche alguien de rango Hunter pronuncia tu nombre en un consejo al que jamás te invitaron."
    }
  },
  {
    id: "marea-ceniza",
    name: "La Marea de Ceniza",
    era: "Ciencia ficción árida",
    tagline: "El sol creció de más, el agua se escondió bajo tierra, y cada viento rojo abre una puerta a otro mundo al que también le falta algo.",
    ambience: "Un planeta donde el sol creció hasta borrar el frío: el agua limpia se bombea de napas kilométricas y solo los trajes selladores guardan algo de humedad. Alienígenas y mutantes —unos criados para la caza, otros para la recolección— comparten aldeas pequeñas y dispersas; cada luna roja, los ciclos mestizos peregrinan al mismo Festín de Akmoltemph'e.",
    worldRules: [
      "El agua limpia se saca de napas kilométricas y vale más que la sangre: quien controla una bomba, gobierna.",
      "Nadie sobrevive a cielo abierto sin traje sellador: el frío ya no existe salvo el que fabrica la tecnología.",
      "Los mutantes se crían con un propósito —caza o recolección— y romper esa casta se paga caro.",
      "Cada luna roja —una de las doce— todos los ciclos mestizos peregrinan al Festín de Akmoltemph'e, y allí ninguna violencia corre.",
      "Los vientos abren portales que no se eligen: te arrastran a otro de los mundos, siempre a uno al que le falta justo lo que a vos te sobra."
    ],
    forgeSeasoning: "Supervivencia y ciencia estilo Dune: escasez de agua, castas de mutantes y alienígenas, trajes selladores, peregrinaje de la luna roja y portales de viento a mundos donde siempre falta un recurso. El motor de la trama es científico-político: nivelar las castas y arreglar el sistema hidráulico. Trueques crueles, tecnología oxidada semiviva y un secreto sobre cómo se secó el mundo. REGISTRO DE NOMBRES: raíces árabe-fremen y casas nobles estilo Dune, de una sola palabra sin guion (Harkonnen, Fenring, Corrino, Bashar, Naib, Sayyadina, Farok, Shaddam).",
    entry: {
      exterior: "Un viento rojo te escupió por un portal a tres días de la aldea más cercana, sin agua y con un mapa de napas que no es de este mundo.",
      interior: "Naciste en esta aldea de recolectores y bombeás agua desde que caminás; esta luna roja, el Festín de Akmoltemph'e amaneció con tu nombre en una deuda que no contrajiste."
    }
  },
  {
    id: "islas-juramento",
    name: "Las Islas del Juramento",
    era: "Mitología griega antigua",
    tagline: "En estas islas el Olimpo es una dirección real: dioses, semidioses y mortales pleitean, y ningún juramento sale gratis.",
    ambience: "Un archipiélago heleno donde el Olimpo ocupa una isla concreta y los dioses menores se meten en los pleitos de cada aldea. Semidioses, oráculos y mortales comparten templos, ágoras y puertos; cada juramento pesa físicamente y el clima se ofende cuando se rompe. De tanto en tanto atracan embajadas del sur, de dioses con cabeza de animal, y del oeste, de águilas y legiones.",
    worldRules: [
      "Todo favor de un dios se paga con memoria propia: primero lo chico, después los nombres.",
      "Romper un juramento cambia el clima de la isla donde se rompió.",
      "El Olimpo es un lugar físico de estas islas: allí se convoca a los más poderosos y allí se dirimen las guerras entre dioses.",
      "La desmesura se castiga sola: cuanto más se ensoberbece un héroe o un dios, más se le tuerce el destino.",
      "La sangre corre como en las tragedias, nunca como carnicería: hay límites que ni los héroes cruzan.",
      "Los muertos opinan en los tribunales, pero solo si alguien vivo les presta la voz."
    ],
    forgeSeasoning: "Mitología griega estilo World History Encyclopedia: Olimpo, dioses, semidioses y héroes con nombres de la época, oráculos, juramentos que pesan y política entre deidades. Tono más family-friendly que cruento —sangre al estilo Game of Thrones, jamás gore extremo tipo Berserk— salvo que la mesa pida más. Cruces opcionales con el panteón egipcio y la Roma legionaria como embajadas o rivales. REGISTRO DE NOMBRES: griegos clásicos o de terminación helena/hebrea, de una sola palabra sin guion (Theron, Kallias, Nikanor, Adrestos, Melanthios, Adiel, Netaniah).",
    entry: {
      exterior: "Tu barco encalló donde el oráculo dijo que encallaría: te esperaban hace tres días y ya te cobraron la estadía en un juramento que no recordás haber hecho.",
      interior: "Serviste toda tu vida en el templo chico de tu isla, hasta que hoy tu dios te habló por primera vez para convocarte al Olimpo… y pedirte algo que ningún mortal debería oír."
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
