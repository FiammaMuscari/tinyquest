import type { CampaignTheme } from "./campaign.types";

export type CampaignRegistryEntry = {
  id: string;
  title: string;
  theme: CampaignTheme;
  slug: string;
  contentBasePath: string;
  sceneIds: string[];
  status: "complete" | "stub";
};

export const literaryCampaignRegistry: CampaignRegistryEntry[] = [
  { id: "luna-roja", title: "El Asesino de la Luna Roja", theme: "hombre_lobo", slug: "luna-roja", contentBasePath: "game/content/campaigns/luna-roja", sceneIds: ["cadaver-bajo-el-molino", "bosque-rojo", "lobo-acusado", "juicio-luna-roja"], status: "complete" },
  { id: "conde-vampiro", title: "La Cena del Conde Vacio", theme: "conde_vampiro", slug: "conde-vampiro", contentBasePath: "game/content/campaigns/conde-vampiro", sceneIds: ["porton-de-la-mansion", "salon-de-los-retratos", "cripta-de-sangre", "cena-del-conde-vacio"], status: "complete" },
  { id: "bosque-embrujado", title: "El Bosque que Recuerda tu Nombre", theme: "bosque_embrujado", slug: "bosque-embrujado", contentBasePath: "game/content/campaigns/bosque-embrujado", sceneIds: ["sendero-que-cambia", "claro-de-los-nombres", "casa-bajo-las-raices", "corazon-del-bosque"], status: "stub" },
  { id: "reliquias-alba-negra", title: "Las Siete Reliquias del Alba Negra", theme: "objetos_sagrados", slug: "reliquias-alba-negra", contentBasePath: "game/content/campaigns/reliquias-alba-negra", sceneIds: ["santuario-saqueado", "mercado-reliquias-falsas", "cripta-primer-portador", "altar-alba-negra"], status: "stub" },
  { id: "escuela-no-amanece", title: "La Escuela que No Amanece", theme: "escuela_encantada", slug: "escuela-no-amanece", contentBasePath: "game/content/campaigns/escuela-no-amanece", sceneIds: ["aula-de-las-velas", "pasillo-que-repite", "biblioteca-cerrada", "examen-medianoche"], status: "stub" },
  { id: "isla-devora-mapas", title: "La Isla que Devora Mapas", theme: "piratas", slug: "isla-devora-mapas", contentBasePath: "game/content/campaigns/isla-devora-mapas", sceneIds: ["costa-sin-norte", "barco-encallado", "cueva-mareas", "tesoro-que-respira"], status: "stub" },
  { id: "castillo-culpa", title: "El Castillo que Heredo la Culpa", theme: "castillo_maldito", slug: "castillo-culpa", contentBasePath: "game/content/campaigns/castillo-culpa", sceneIds: ["puente-juramentos", "salon-escudos-negros", "habitacion-sin-heredero", "torre-no-perdona"], status: "stub" },
  { id: "cripta-rey", title: "La Cripta del Rey sin Ultima Palabra", theme: "cripta", slug: "cripta-rey", contentBasePath: "game/content/campaigns/cripta-rey", sceneIds: ["puerta-monedas-frias", "corredor-nombres-borrados", "camara-juramento", "trono-bajo-tierra"], status: "stub" }
];
