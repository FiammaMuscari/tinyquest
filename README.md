# Tiny Quest

Tiny Quest is a short-session tabletop RPG with an AI Dungeon Master. Each campaign lasts up to 15 minutes, has 3 scenes, and runs deterministic dice rules (d20 + d4 + d6) with a Groq/Qwen narrator that can only narrate facts the engine already resolved.

Spanish-first, local-first, multiplayer-ready.

---

## What it looks like

- A **top status bar** with scene, round, turn, danger clock, and timer.
- A **left panel** (turn queue) showing players and their stats.
- A **center panel** with the scene image, action choices, dice roll controls, and resolution.
- A **right panel** (Dungeon Master IA) with narration, turn history, and clues.

---

## Prerequisites

- **Node.js** ≥ 18 (check with `node -v`)
- **npm** ≥ 9 (check with `npm -v`)
- A **Groq API key** (free at [console.groq.com](https://console.groq.com)) — optional, the game runs in mock mode without one

---

## Quick start (mock mode — no API key needed)

```bash
# 1. Clone the repo
git clone https://github.com/FiammaMuscari/tinyquest.git
cd tinyquest

# 2. Install dependencies
npm install

# 3. Run the dev server
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

In mock mode the Dungeon Master uses pre-written fallback narration instead of Groq. The game is fully playable.

---

## Full setup (with Groq AI narration)

```bash
# 1. Clone and install (same as above)
git clone https://github.com/FiammaMuscari/tinyquest.git
cd tinyquest
npm install

# 2. Create the environment file
cp apps/web/.env.example apps/web/.env.local   # if .env.example exists
# or create it manually:
```

Create `apps/web/.env.local` with the following content:

```env
VITE_MASTER_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here
VITE_GROQ_MODEL=qwen/qwen3-32b
GROQ_MODEL=qwen/qwen3-32b
VITE_IMAGE_PROVIDER=mock
VITE_SOUND_PROVIDER=mock
```

```bash
# 3. Run the dev server
npm run dev
```

> **Note:** Qwen is called with reasoning disabled so it returns clean JSON instead of `<think>` blocks.

---

## Build for production

```bash
npm run build
# Output goes to apps/web/dist/
```

---

## Project structure

```
tinyquest/
├── apps/
│   └── web/                  # Vite + React frontend (the game UI)
│       ├── src/
│       │   ├── App.tsx       # All UI components and game loop
│       │   ├── styles/
│       │   │   └── app.css   # All styles (CSS custom properties, responsive grid)
│       │   └── main.tsx
│       └── vite.config.ts
├── packages/
│   ├── game-engine/          # Deterministic rules: dice, turns, campaigns, memory
│   ├── ai-master/            # Groq/Qwen DM provider, prompt building, JSON validation
│   └── atmosphere/           # Image and sound providers (mock or external)
├── server/                   # Optional backend (multiplayer room persistence)
├── docs/                     # Design docs and campaign authoring guide
└── package.json              # Monorepo root (npm workspaces)
```

---

## How the game works

1. **Pick a campaign** — each one has a premise, 3 scenes, NPCs, clues, and endings.
2. **Design your character** — choose species, role, pet, and distribute 8 stat points across body, mind, charm, creativity, courage, focus, luck.
3. **Click "Iniciar solo con bots"** — the session starts with you + 2 AI-controlled players.
4. **Each turn:** pick an action, choose a stat, optionally use your pet (adds a d4 bonus), then roll.
5. **Dice:** d20 resolves the action. d4 is a bonus. d6 resolves complications on partial success or failure.
6. **Danger clock:** rises on failures/partials. If it reaches 10 the scene gets harder.
7. **After 4 rounds per scene** the story advances to the next scene.
8. **The Dungeon Master narrates** each turn result — consequences, NPC dialogue, clue reveals.

---

## Core rule

```
ENGINE DECIDES FACT → LLM NARRATES FACT → RAG RETRIEVES CONTINUITY
```

The engine is the source of truth. It owns campaigns, scenes, turns, rounds, players, dice rolls, danger, progress, clues, flags, memory, and endings.

The AI narrator only narrates facts the engine already resolved. It cannot invent clues, damage, HP changes, scene changes, dice results, or endings. Embeddings do not authorize new facts — they only retrieve what the engine already confirmed.

---

## Campaigns

Campaigns live in `packages/game-engine/src/campaigns.ts`. Each one needs:

- A strong premise and story hook
- 3 scenes with objectives, clues, NPCs, and atmosphere
- Multiple endings depending on flags, danger, progress, and memory
- Actions with recommended stats, unlock flags, and risk levels

See `docs/CAMPAIGN_AUTHORING.md` for the full authoring guide.

---

## Dice system

| Die | Purpose |
|-----|---------|
| d20 | Primary action resolution |
| d4 | Bonus (pet, skill, item, bond, or advantage) |
| d6 | Complication, damage, or consequence on partial/failure |

Total = d20 + stat modifier + d4 bonus. Compared against a difficulty set by the engine.

- **17+** → success
- **10–16** → partial success (action succeeds with a cost)
- **≤ 9** → failure

---

## Memory system

TinyQuest has four memory layers:

| Layer | What it stores | Used by |
|-------|---------------|---------|
| `memorySummary` | Compact current truth: clues, suspects, betrayals, bonds, stakes, twist | DM prompt every turn |
| `sessionLog` | Turn-by-turn record: action, stat, dice, consequence, flags, narration | DM prompt, UI history |
| `narrativeMemory` | Deep structured facts, characters, causal links, story graph | Retrieval at each turn |
| **RAG vector store** | Embedded narrative memories with hybrid scoring | Retrieved before DM call |

### Narrative RAG (new)

Each turn produces up to 8 `EmbeddedMemory` records (fact, clue, npc\_memory, moral\_choice, failed\_action, causal\_link, dialogue, scene\_transition). Before generating narration, the engine retrieves the most relevant past memories using hybrid scoring:

- **40%** cosine similarity (text embedding)
- **25%** entity overlap (NPC/object/clue IDs)
- **10%** importance weight
- **8%** scene proximity
- **7%** unresolved bonus
- **5%** recency + type boost
- Penalties for resolved/forbidden memories

`LocalEmbeddingProvider` genera vectores normalizados de palabras, bigramas y
trigramas morfológicos con feature hashing. Corre sin red y hace que el scoring
híbrido compare similitud textual real. `MockEmbeddingProvider` queda como alias
compatible para tests e integraciones anteriores.

### Narrative memory primitives

- **StoryThreads** — open narrative threads with unresolved questions per NPC/object/scene. Auto-updated each turn; escalated if the same conflict recurs.
- **PendingConsequences** — delayed state effects (danger boost, NPC hostility) triggered when a `Condition` is met (flag, clue revealed, danger threshold).
- **MoralProfile** — per-player moral dimension tracking (mercy, truth, deception, violence, sacrifice, loyalty, corruption, pragmatism). Remembered by NPCs.

### Core invariant

```
ENGINE DECIDES FACT → LLM NARRATES FACT → RAG RETRIEVES CONTINUITY
```

The LLM cannot invent clues, NPCs, damage, scene changes, dice results, or endings. `stateSuggestions` from the LLM are advisory only — real state is mutated exclusively by `applyStatePatch`.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript |
| Styling | CSS custom properties + CSS Grid (no Tailwind components) |
| Fonts | Cinzel (panel titles), Nunito (body), Fredoka (logo) |
| Game logic | Pure TypeScript, zero React deps |
| AI narrator | Groq API — `llama-3.3-70b-versatile` (default, overridable) |
| Icons | Lucide React |
| Monorepo | npm workspaces |

---

## Environment variables reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_MASTER_PROVIDER` | No | `mock` | `groq` for AI narration, `mock` for offline fallback |
| `GROQ_API_KEY` | If groq | — | Your Groq API key |
| `VITE_GROQ_MODEL` | No | `qwen/qwen3-32b` | Groq model to use |
| `GROQ_MODEL` | No | `qwen/qwen3-32b` | Server-side model (if backend is used) |
| `VITE_IMAGE_PROVIDER` | No | `mock` | `mock` uses local images |
| `VITE_SOUND_PROVIDER` | No | `mock` | `mock` uses local audio |

---

## Roadmap

- [x] Narrative RAG with semantic embeddings (`MockEmbeddingProvider` + hybrid scoring)
- [x] StoryThreads — open narrative threads with unresolved questions
- [x] PendingConsequences — delayed state effects triggered by conditions
- [x] MoralProfile — per-player moral dimension tracking remembered by NPCs
- [x] NarratorVoice — per-campaign literary style with few-shot examples
- [x] Bot personality and loyalty rules
- [x] Deterministic ending selection
- [ ] Wire NarrativeMemoryIndex into turn flow (App.tsx integration)
- [ ] LocalEmbeddingProvider (transformers.js, runs fully offline)
- [ ] Per-class special actions
- [ ] Multiplayer room persistence
