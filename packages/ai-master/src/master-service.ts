import type { DungeonMasterProvider } from "@tiny-quest/game-engine";
import { GroqDungeonMasterProvider } from "./groq-dungeon-master";

export function createDungeonMasterProvider(name = "groq", env: Record<string, string | undefined> = {}): DungeonMasterProvider {
  if (name === "groq" || name === "gemini") return new GroqDungeonMasterProvider({ ...env, provider: name });
  throw new Error(`MASTER_PROVIDER=${name} no esta permitido. Tiny Quest usa Groq o Gemini como Dungeon Master.`);
}
