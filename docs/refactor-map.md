# Refactor map — read this BEFORE exploring the code

Purpose: save exploration cost (tokens/time) on every session. Grep these anchors
instead of reading whole files. **Update this map whenever you move or rename a
section** — an outdated map costs more than no map.

## Hard rules (violating these wastes a whole session)

1. `App.tsx` is ~2500 lines. **Never read it whole.** Grep the anchor, then read ±40 lines.
2. After touching `packages/ai-master/**`, **restart the dev server** — the stale
   bundle produces ghost symptoms (features silently do nothing).
3. `app.css` is ~3500 lines with several `!important` battle zones. New styles go
   at the END with a dated banner comment. The `.gameFrameResizable` block must
   stay last among layout rules (it wins the grid-template-columns war by order).
4. Fiamy plays at **1360×700**. Verify UI at that size, not at 1300-1500+.
5. Dev runs with React StrictMode semantics (double effect invocation). Effects
   that write state on mount must be idempotent (compare before set).

## apps/web/src/App.tsx — grep anchors

| Anchor (grep) | What lives there |
|---|---|
| `function App()` | All state, turn flow, `forgeStory`, `startSolo`/`launchSolo`, `reimagineHeroPortrait`, auto hero-portrait effect, column drag |
| `function LobbyScreen` | World cards, perspective/party pills, forge input, `ForgeRitual`, `forgedTeaser` (chips → `CharacterPeekModal`), hero summary |
| `function CharacterDesigner` | Hero forge: identity + portrait + Reimaginar, tabs Linaje/Oficio/Compañero, stat bars, talents |
| `function TurnQueue` | Left rail: player cards (avatars via `HeroAvatarImg`, bots get generated portraits here), audio, journeyPanel (map + world laws) |
| `function ScenePanel` | Scene header, objective, choice cards |
| `function ActionComposer` | Tirada: stat select, pet, roll button |
| `function DungeonMasterPanel` | Center column: narration, dialogue, history |
| `function CastPanel` | "Personajes" modal in-game (public NPC data only) |
| `function NpcPortrait` | Round portrait: cached AI image or procedural SVG medallion |
| `function HeroAvatarImg` | Square avatar `<img>`: cached AI image or medallion data-URI (inherits CSS of existing img selectors) |
| `function CharacterPeekModal` | Lobby popup for a forged character (never shows secret/whatTheyHide/alibi) |
| `function ForgeRitual` | Animated forging state (rotating lines + embers) |
| `function heroPortraitSpec` | Hero identity → portrait prompt |
| `forgedTeaser` | Post-forge teaser JSX inside LobbyScreen |

## Portraits system (2026-07-06)

- `apps/web/src/portraits.ts`: `characterPortraitUrl(name, appearance, styleHint, seedNonce)`
  → Pollinations URL (seed = hash(name) + nonce·7919). `loadPortrait(url)` →
  IndexedDB `tiny-quest-portraits` blob cache + fetch queue. `useGeneratedPortrait(url)`
  React hook (keeps prev image while a new one loads, background-retries every 30s
  up to 8 rounds while mounted). `medallionDataUri(name)` fallback placeholder.
- **Tuning is load-bearing (measured 2026-07-06)**: queue concurrency MUST be 1
  (Pollinations queues per IP — 2 parallel downloads both blow the timeout),
  timeout 120s, retry series [0, 5s, 15s]. A fresh generation takes 20–90s under
  load; after that it's instant forever (cache keyed by URL, survives restarts).
  Don't "optimize" the prompt string in `characterPortraitUrl` — changing it
  changes every URL and invalidates the whole portrait cache.
- Cast portraits are prefetched at game start (effect in `App()` keyed on
  `room?.selectedCampaignId`); its styleHint must stay identical to CastPanel's.
- The forge prompt (`groq-dungeon-master.ts`, story-forge section) REQUIRES
  `appearance` to state species/ethnicity, gender, apparent age, skin/features —
  that's what makes portraits show niños/ancianas/vampiros/mestizos correctly.
- Hero look picker (`lookPicker` in CharacterDesigner): gender/skin/eyes stored in
  `Character.look` (optional, engine types.ts) — traits go FIRST in the prompt
  (`heroPortraitSpec`). Choosing a trait calls `onUnlockAutoPortrait` (exits
  manual/classic-avatar mode). `petPortraitUrl` gives the companion its own
  creature image (designer pet tab, hero summary, queue). `loadPortrait`/hook
  accept `{ priority: true }` — hero portraits jump the download queue.
- Hero portrait auto-generates from identity (name/linaje/oficio/concepto),
  debounced 800ms, in an effect in `App()`. Picking a classic avatar from the
  picker disables auto-gen (manual mode); "Reimaginar" re-enables it with a
  random nonce. Same-identity check compares URL minus `seed=` — don't "fix" it
  back to plain equality or reloads will clobber rerolled portraits.
- NPC portraitUrl is stamped in `forgeStory` (App) from the LLM's `appearance`.

## CSS zones (apps/web/src/styles/app.css)

- Choice cards / actionColumn: scoped `.actionColumn` overrides + media
  `max-height: 820px` compacts Tirada/Resolución. Mostly `!important`.
- `.gameFrame` columns are positional; children order in App.tsx defines
  left/center/right. Resizable columns: `--col-left/--col-right` vars +
  `.gameFrameResizable` block (keep at end).
- Grid trap: explicitly-placed grid items (grid-area) steal cells from
  auto-placed siblings — the 3 game panels have explicit `grid-area: 1/1|2|3`.
- End of file: portraits/forge/peek styles (banner "Retratos generados…2026-07-06").

## Verification recipes

- `npm run typecheck` · `npm test` (node:test, 238 tests, ~16s) · single file:
  `node --test tests/foo.test.mjs`.
- Dev server: see `.claude/skills/run` (vite on 127.0.0.1:5173; don't kill it if
  Fiamy is playing). App.tsx/CSS hot-reload; ai-master does NOT (rule 2).
- Browser E2E: headless Chrome CDP — spawn
  `google-chrome --headless=new --remote-debugging-port=92XX --window-size=1360,700`,
  fetch `/json` for the ws URL, drive with native `WebSocket` (Node ≥22), click via
  `Runtime.evaluate`, `Page.captureScreenshot`. Write the script in the session
  scratchpad; past examples: shot-lobby/shot-hero/shot-queue (session 2026-07-06).
- Forge E2E needs LLM keys in `.env.local` (Gemini free tier rate-limits: retry).

## Content traps

- `packages/game-engine/src/campaigns.ts`: the `campaigns` array is REPLACED
  mid-file — only luna-roja survives; dukes-last-mask/buried-crown are dead code.
- Worlds: `packages/game-engine/src/worlds.ts` — `worldRules` are secret (never
  render them in lobby); tagline/entry are the only public texts.
- Improvised campaigns live in App state, not in the campaign registry.
