# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## TinyQuest

Narrative RPG with AI as Dungeon Master. Short sessions (~15 min), 3 scenes, deterministic dice rules (d20+stat+d4), LLM narrator (Groq, default `llama-3.3-70b-versatile`) that **only narrates facts already resolved by the engine**. Spanish-first gameplay, local-first, multiplayer-ready architecture.

## Before exploring — token saver

Read `docs/refactor-map.md` FIRST when touching UI (`App.tsx` / `app.css`) or
verifying in the browser. It has grep anchors, CSS danger zones, E2E recipes and
known traps. Rules that always apply:

- `App.tsx` (~2500 lines) and `app.css` (~3500 lines): grep anchors, read ranges — never whole files.
- Restart the dev server after touching `packages/ai-master/**` (stale bundle = ghost bugs).
- Verify UI at **1360×700** (Fiamy's viewport).
- Keep `docs/refactor-map.md` updated when you move/rename sections — that file is the map.

## Commands

```bash
npm run dev          # dev server at http://127.0.0.1:5173
npm run build        # production build
npm run typecheck    # TypeScript check (no emit)
npm test             # all tests via node:test
npm run groq:smoke   # smoke test Groq narration
```

Run a single test file:
```bash
node --test tests/engine.test.mjs
node --test tests/ai-master.test.mjs
```

## Monorepo structure

```
apps/web/src/App.tsx              → All game UI (~1700 lines, intentionally monolithic)
apps/web/src/campaign-assets.ts   → Campaign image map
apps/web/src/character-assets.ts  → Stat/talent image map

packages/game-engine/src/
  engine.ts                       → createGameRoom, resolvePlayerAction, applyNarration
  types.ts                        → All domain types
  resolution-plan.ts              → buildResolutionPlan → ResolutionPlan (contract for LLM)
  checks.ts                       → resolveCheck → CheckOutcome via d20+stat
  combat.ts                       → resolveAttack / resolveDefense
  consequences.ts                 → rollConsequence (consequence bank)
  dice.ts                         → rollDice
  danger.ts                       → getDangerBand, capDangerGainForRound (+2 max/round)
  pacing.ts                       → shouldAdvanceScene, isFinalScene
  scenes.ts                       → createSessionForCampaign, createScenesForCampaign
  endings.ts / ending-resolution.ts → determineEnding, resolveEndingForRoom
  story-graph.*                   → compiler, runtime, types for story graph
  room-state.ts                   → getActivePlayer, getCurrentScene, getVisibleActionChoices
  living-state-adapter.ts         → GameRoom ↔ LivingGameState bridge
  campaigns.ts                    → campaignById, defaultCampaign
  character.ts                    → createCharacter
  bots.ts / bot-personality.ts    → bot players, personality profiles, intent/emotion
  energy.ts                       → regenerateRoundEnergy, canPayActionEnergy
  narrative-contract.ts           → getNarrativeActionType, narrativeDoDont
  player-narration.ts             → buildCleanTurnNarration, buildVisibleConsequence
  context-coherence.ts            → concretizeActionText, validateActionSpecificity
  consequence-builder.ts          → buildMechanicalConsequence (specific consequence text)
  memory.ts                       → initialMemory, indexTurnResult, buildDmContext
  game/memory/
    game-state.types.ts           → LivingGameState, StatePatch, ClueState, NPCState…
    game-state.reducer.ts         → applyStatePatch (pure reducer)
    game-state.store.ts           → in-memory store
    dmContextBuilder.ts           → buildDmContext (wraps retrieval)
    narrativeStore.ts             → NarrativeMemory indexing
    retrieval.ts                  → retrieveForCurrentTurn → DmRetrievedContext
    causalGraph.ts                → updateCausalLinks
    factExtractor.ts              → NarrativeFact extraction
    action-memory.ts / inventory-memory.ts / relationship-memory.ts
  game/rag/
    rag.types.ts                  → RagDocument, RagChunk, RagQuery
    rag.indexer.ts                → buildRagIndex (from campaign markdown docs)
    rag.chunker.ts                → chunk documents, extract keywords
    rag.search.ts                 → searchRag (keyword+entity scoring, no embeddings yet)
    rag.context-builder.ts        → build RAG context for DM
  game/campaigns/
    campaign.types.ts             → CampaignGraph, SceneNode, Condition types
    campaign.loader.ts            → load campaign from markdown
    campaign.registry.ts          → campaign registry
  game/content/campaigns/         → Campaign content in markdown (bosque-embrujado etc.)
  game/dm/
    dm.prompt.ts / dm.context-pack.ts / dm.action-selector.ts
    dm.ending-selector.ts / dm.fallback.ts / dm.resolve-turn.ts / dm.schema.ts

packages/ai-master/src/
  master-service.ts               → createDungeonMasterProvider (factory)
  groq-dungeon-master.ts          → GroqDungeonMasterProvider (default: llama-3.3-70b-versatile)
  prompt-builder.ts               → buildDungeonMasterSystemPrompt, buildDungeonMasterPayload
  narration-contract.ts           → Zod schema, validate/repair/parse DungeonNarrationOutput
  llm-budget.ts                   → token budget control
  schemas.ts / types.ts           → Zod schemas and DM types

packages/atmosphere/src/          → Image (Bedrock/local SD) + Sound (ElevenLabs) providers

server/                           → Reserved for multiplayer (currently empty)
tests/                            → node:test files (*.test.mjs)
scripts/                          → run-groq-narration-smoke.mjs
docs/game-systems/                → Design docs: narrative-pacing.md, coherence-module.md, endings.md
```

## Environment variables (`.env.local` at repo root)

```
VITE_GROQ_API_KEY=...          # narration (optional — mock mode without it)
VITE_GROQ_MODEL=...            # override model (default: llama-3.3-70b-versatile)
VITE_AWS_ACCESS_KEY_ID=...     # Bedrock images (optional)
VITE_AWS_SECRET_ACCESS_KEY=...
VITE_ELEVENLABS_API_KEY=...    # voice (optional)
```

Without any env vars the game runs in **mock mode** (fully playable).

## Core invariant — The Engine is Truth

```
ENGINE DECIDES FACT → LLM NARRATES FACT → RAG RETRIEVES CONTINUITY
```

- `packages/game-engine` is **pure**: no side effects, no HTTP, no IO.
- The LLM receives a `ResolutionPlan` (the only source of truth for each turn).
- The LLM **cannot** invent NPCs, clues, objects, locations, or change dice results.
- `DungeonNarrationOutput` is validated with Zod and repaired via `repairDungeonNarrationOutput` if it violates the plan. There is a deterministic fallback.
- `stateSuggestions` from the LLM are advisory only; real state is mutated exclusively by `applyStatePatch`.

## Turn flow

```
getVisibleActionChoices(room)                    // filtered by scene + flags + energy
→ resolvePlayerAction(room, action, stat)
    resolveCheck()                               // d20 + stat → success/partial/failure
    rollConsequence()                            // bank draw if not success
    resolveAttack/Defense()                      // if combat
    applyStatePatch(livingState, patch)          // pure reducer → new LivingGameState
    buildResolutionPlan(...)                     // → ResolutionPlan (LLM contract)
    → ActionResolution { room, check, narrationRequest }
→ MasterService.generateNarration(narrationRequest)
    buildDungeonMasterSystemPrompt()
    buildDungeonMasterPayload(input)             // ~8000 chars structured JSON
    Groq/LLM → raw JSON
    parseDungeonNarrationOutput(raw, plan)       // Zod validate → repair → fallback
    → DungeonNarrationOutput
→ applyNarration(room, resolution, narration)
    process stateSuggestions (advisory only)
    build GameEvent → sessionLog
    update memorySummary + narrativeMemory
    updateCausalLinks()
    resolveEndingForRoom()
    shouldAdvanceScene() → advance or end
    → new GameRoom
```

## Key types

| Type | Where | Purpose |
|------|-------|---------|
| `StatKey` | types.ts | `body\|mind\|charm\|creativity\|courage\|focus\|luck` |
| `CheckOutcome` | types.ts | `success\|partial_success\|failure` |
| `ScenePhase` | types.ts | `intro\|investigation\|pressure\|combat\|climax\|ending` |
| `GameRoom` | types.ts | Entire mutable game state (immutable between turns — each turn returns new copy) |
| `LivingGameState` | game-state.types.ts | Entity state: clues, NPCs, items, routes, factions, action memory, endingScore |
| `StatePatch` | game-state.types.ts | Delta applied by `applyStatePatch` — the only way to mutate state |
| `ResolutionPlan` | resolution-plan.ts | Contract from engine to LLM: mustHappen, mustNotHappen, cluePolicy, npcDirectives, botDirectives |
| `DungeonNarrationOutput` | types.ts | LLM output: narration, dialogue, consequence, clueReveals, memoryPatch |
| `MemorySummary` | types.ts | Compact memory for DM prompt (hard limits: 24 facts, 12 clues, 16 NPCs) |
| `NarrativeMemory` | types.ts | Structured deep memory: NarrativeFact[], CharacterMemory[], CausalLink[] |
| `Campaign` | types.ts | Full campaign: scenes, npcs, clues, enemies, endings, twists, moralDilemmas |

## Danger clock

`dangerClock` runs 0–10 and drives scene phase:

| Range | Band | Behavior |
|-------|------|----------|
| 0–3 | low | Investigate freely |
| 4–6 | medium | NPCs react, costs matter |
| 7–8 | high | Threat active, routes closing |
| 9–10 | critical | Forced advance / climax / tragic death |

Danger gain is capped at **+2 per full round** to prevent instant-climax from bad rolls.

## Ending score

`endingScore: { truth, mercy, sacrifice, corruption, chaos }` — accumulated per action via keywords in choice labels. `resolveEndingForRoom()` checks `CampaignEnding.requires` conditions at end of each turn.

## RAG (current state)

`packages/game-engine/src/game/rag/` implements keyword+entity scoring over campaign markdown docs. **No semantic embeddings yet.** `searchRag()` scores chunks by entity ID overlap and keyword match. The RAG context is included in `buildDmContext()` → `DmRetrievedContext` → `narrationRequest.retrievedContext`.

## Bot personality

Two default bots (Belo, Miri) have hardcoded personality profiles in `bot-personality.ts`. `chooseBotIntent` and `chooseBotEmotion` drive their `companionMoments` in the LLM output. Bots can die tragically at `dangerClock >= 9` + failure + high consequence roll.

## Where to add things

| What | Where |
|------|-------|
| New game rule | `packages/game-engine/src/` |
| New species / role / pet | `species.ts`, `roles.ts`, `pets.ts` |
| New campaign | `campaigns.ts` + `scenes.ts` + `game/content/campaigns/` |
| UI change | `apps/web/src/App.tsx` |
| Improve DM narration | `packages/ai-master/src/prompt-builder.ts` |
| New image/sound provider | `packages/atmosphere/src/` |
| New test | `tests/*.test.mjs` |
| Embedding / RAG memory | `packages/game-engine/src/game/rag/` |

## Conventions

- Game language is **Spanish**; types/code are in **English**.
- `App.tsx` is intentionally one large component — do not fragment without clear reason.
- Tests use native `node:test`, importing directly from packages (no jest/vitest).
- All state mutations go through `applyStatePatch` — never mutate `GameRoom` directly.
- LLM output is always validated and repaired before use — never trust raw LLM JSON.
- The `narration-contract` in `narrationRequest` defines `must[]` and `avoid[]` per turn; always populated from `ResolutionPlan`.
