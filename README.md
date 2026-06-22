# Tiny Quest

Tiny Quest is a short, multiplayer-ready tabletop RPG built around deterministic game rules and an LLM narrator.

The game is Spanish-first, free/local-first, and currently uses Groq/Qwen as the Dungeon Master narrator. A full session is designed to last up to 15 minutes and uses campaigns of 3 scenes.

## Core Rule

The game engine is the source of truth.

The engine owns:

- campaigns, scenes, turns, rounds
- players, bots, stats and pets
- d20, d4 and d6 rolls
- danger, progress and consequences
- clues, flags, memory and endings
- visible actions and unlocked paths

Groq/Qwen only narrates facts that the engine already resolved. It must not invent clues, items, damage, HP changes, scene changes, dice results or endings.

## Project Structure

- `apps/web`: Vite React UI.
- `packages/game-engine`: deterministic game rules, campaign data, dice, turns, memory and branching.
- `packages/ai-master`: Groq/Qwen Dungeon Master provider, prompt building, JSON validation and cache.
- `packages/atmosphere`: local/mock atmosphere providers.
- `docs`: design and authoring documentation.

## Run Locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Groq/Qwen

Create `.env.local`:

```bash
VITE_MASTER_PROVIDER=groq
GROQ_API_KEY=your_groq_key
VITE_GROQ_MODEL=qwen/qwen3-32b
GROQ_MODEL=qwen/qwen3-32b
VITE_IMAGE_PROVIDER=mock
VITE_SOUND_PROVIDER=mock
```

Qwen is called with reasoning disabled so it returns clean JSON instead of `<think>` blocks.

## Dice

- `d20`: primary action resolution.
- `d4`: bonus from pet, skill, item, bond or advantage.
- `d6`: complication, damage or consequence on partial/failure.

Dice must have a gameplay reason. Do not add random rolls only for flavor.

## Campaigns

Campaigns live in `packages/game-engine/src/campaigns.ts`.

Each campaign should have:

- strong premise
- 3 scenes
- real clues defined in data
- NPCs with motives
- enemies if needed
- multiple endings
- actions with flags and outcomes
- moral cost or risk

## Scenes

Each scene should have:

- objective
- danger
- clue ids
- NPC ids
- optional enemy ids
- multiple choice actions
- atmosphere prompts

The engine converts campaign scenes into runtime scenes in `packages/game-engine/src/scenes.ts`.

## Actions

Actions can define:

- `id`
- `label`
- `description`
- `intent`
- `recommendedStat`
- `allowedStats`
- `riskLevel`
- `requiredFlags`
- `blockedByFlags`
- `unlocksFlags`
- `progressOnSuccess`
- `dangerOnPartial`
- `dangerOnFailure`
- `memoryImpact`
- `npcReaction`
- `combatEffect`

Visible actions are resolved centrally with `getVisibleActionChoices`.

## Memory

Tiny Quest uses two memory layers:

- `memorySummary`: compact current truth, including clues, suspects, betrayals, bonds, stakes and current twist.
- `sessionLog`: turn-by-turn record with action, stat, dice total, consequence, flags and narration.

The LLM receives both every turn. The UI shows accumulated story first, then current turn summary, then options.

## Adding Content

When adding or improving a campaign:

1. Keep the base premise.
2. Add concrete clues in data.
3. Give NPCs motives.
4. Make actions unlock flags or clues.
5. Use partial/failure consequences.
6. Make final resolution depend on flags, danger, progress and memory.
7. Keep it playable in 15 minutes.

See `docs/CAMPAIGN_AUTHORING.md`.

## Next Steps

- Expand clue metadata into first-class typed data.
- Add per-character/class special actions.
- Add deterministic ending selection.
- Improve bot personality and loyalty rules.
- Add multiplayer room persistence.
