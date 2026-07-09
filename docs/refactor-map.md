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
| `function ScenePanel` | Scene header, objective, choice cards (imagen estática de fondo, sin selector) |
| `function ActionComposer` | Tirada: stat select, pet, roll button |
| `function DungeonMasterPanel` | Center column: `dmSceneImage` (imagen viva de escena + selector 🏞️🧝🌫️ ARRIBA de la narración, 2026-07-09), narration, dialogue, history |
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

## Lobby flow (4 steps — HERO FIRST since 2026-07-06 night; order changed twice that day, confirm with Fiamy before moving it again)

- LobbyScreen renders: `1 · Forjá tu héroe` (`.heroSpecial` summary o
  `CharacterDesigner`) → `2 · Elegí mundo` (worldGrid, `WorldCard` con arte IA +
  `worldEmblems` + tilde) → `3 · Forjá tu historia` (pills + ideas input +
  `ForgeRitual` + `forgedTeaser`) → `4 · Revisá y empezá` (`finalStep`:
  questTemper + CTA). Step titles use `LobbyStepTitle` (rombo numerado + serif),
  CSS block "Reskin del lobby" at the END of app.css.
- CTA gating: disabled until `lookComplete(draft)` (género+piel+ojos+pelo, los 4
  obligatorios) and hero saved (`!editingHero`). Without look, NO hero image is
  generated at all.
- Two hero images: face (`characterPortraitUrl`) + fullbody (`fullBodyPortraitUrl`),
  same seed; `shotToggle` switches preserving the seed (regex replace on the URL).
  `avatarShot` lives in `Character.look`.
- Quest temper: `getQuestTemper/applyQuestTemper` (engine `quest-temper.ts`) —
  +1 most-demanded stat, −1 least-demanded, from scenes' allowedStats; applied to
  a COPY at `startSolo` (draft untouched); shown as chips in `finalStep`.
- Forge extras (all optional, schema-lax): `Campaign.forgeNotes` carries
  summary{objective,risk,firstMystery,timeLimit}, keywordsUsed[{idea,how}],
  heroBond, evidence[]; NPCs carry bond + whyMightLie (public, no spoilers).
  Forge input now includes `hero` and forbids NPCs reusing the hero's name
  unless bond explains it. maxTokens 3400.
- Hidden NPC relations (SECRET layer, never rendered by any UI panel): forge asks
  for `npcRelations[{from,to,nature}]` (names) → `buildImprovisedCampaign` resolves
  them onto `CampaignNPC.relationshipToOtherNPCs` (ids); luna-roja has 3 authored
  ones. `buildCompactGroqPrompt` sends them as `npcs[].hiddenTies` (subtext-only
  rule, included only when ties exist). If a UI panel ever lists NPC fields, keep
  relationshipToOtherNPCs out (same tier as secret/whatTheyHide/alibi).
- Forge coherence gate: `storyCoherenceIssues` in
  `packages/ai-master/src/story-coherence.ts` (pure, tested in
  `tests/story-coherence.test.mjs`) runs after each forge attempt in
  `generateImprovisedStory`; if the first output loses requested names, fuses
  the hero's companion with a requested pet, or turns a requested duration into
  `summary.timeLimit`, it regenerates once and keeps the output with fewer
  issues. Issues are logged via `logDmEvent("story-forge", { coherence })`.

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
- Lobby screenshots: `node scripts/shot-lobby.mjs` (playwright-core + system
  Chrome, dev server must be running) → `scripts/.shots/` (gitignored). Shoots
  1672px (mockup width) and 1360×700 (Fiamy's viewport).
- ALL external assets are self-hosted under `apps/web/public/media/`: fonts
  (`media/fonts/fonts.css` + woff2, loaded from index.html — do NOT re-add the
  Google Fonts @import) and UI audio (`media/audio/ui-click.wav`, played by
  `src/ui-sound.ts`). Pollinations stays remote (runtime generation).
- Design assets from Fiamy's pack live in `apps/web/public/assets/ui|worlds|companions`
  (palette: gold #D4AF37, blue_deep #0D1B2A, black_panel #050A12, parchment #EADFC6).
  `uiIcon()/worldArt/worldEmblems/companionLogos/petImage` helpers in App.tsx near
  WorldCard. World cards use the packed art (Pollinations only for future worlds);
  the 3 base pets use their companion logos everywhere via `petImage`. CSS reskin
  block at END of app.css ("Reskin del lobby"); `body:has(.lobbyShell)` sets the
  navy background; `.uiIcon` needs !important against portrait img rules.
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

## Multijugador — party host-autoritativo (2026-07-09)

Peer local funcionando: servidor de salas en Go + cliente TS. El juego (motor +
LLM) corre en el navegador; el server Go SOLO relaya. El HOST forja, resuelve
cada turno contra su motor local y difunde `GameRoom`; los invitados mandan su
acción y adoptan el estado.

- **Servidor**: `server-go/` (ver su README). `npm run server:go` → ws://localhost:8787.
  `npm run server:go:test`. Requiere Go (instalado en `~/.local/go` en esta máquina).
- **Cliente**: `apps/web/src/multiplayer/ws-client.ts` (`MultiplayerClient`,
  singleton `multiplayerClient`, URL de `VITE_WS_URL`) + `protocol.ts`. El cliente
  es transporte + estado consciente de rol; emite `guest_action`/`story_started`/
  `state_update` para que App.tsx resuelva y difunda.
- **App.tsx anclas**: `startMultiplayerHost` / `openMultiplayerJoin` (→ `beginJoin`) /
  `startMultiplayerParty` (host: forja + `createPartyRoom` + `startStory`) /
  `runMultiplayerTurn` (invitado envía) / `launchMultiplayerRoom` (montar sala) /
  `adoptRemoteRoom` (invitado adopta estado). Efectos que escuchan al cliente:
  `story_started`, `state_update`, `guest_action`. `runTurn` toma `overrideUsePet`
  y, si `mpRef.current.isHost`, llama `signalNarrating()` y `broadcastState()`.
  `mpRef` evita capturar mpState viejo dentro de `runTurn`.
- **Motor**: `createPartyRoom(host, guests, campaign)` + `PartySeat` en `engine.ts`.
  Los ids de jugador vienen del SERVIDOR (deben casar para rutear turnos:
  `activePlayerIndex` ↔ `activePlayerId`). `createGameRoom` acepta `humanId/humanName`.
- **Fases** (`MultiplayerPhase`): idle→connecting→lobby_host/lobby_guest→
  waiting_room→active/watching/narrating→ended (host_gone si se cae el host).
  Renombradas desde el viejo modelo 2-jugadores (opponent_*/waiting_guest).
- **Regla**: si tocás `protocol.ts` (TS) o `protocol.go`, mantené los nombres de
  tipo/campo idénticos. `tests/multiplayer-e2e.test.mjs` levanta el binario Go y
  maneja el cliente TS real contra él — es la prueba de que el protocolo case.
- **Verificación de UI**: `scratchpad/mp-browser.mjs` abre un host crudo por ws,
  maneja la UI de invitado real (CDP) uniéndose y confirma la sala de espera.

## Sin bots (2026-07-09)

- `launchSolo` crea SIEMPRE con `botCount 0`: la campaña es en solitario o party
  real por código. El modo "Con compañeros" (Belo/Miri) y todo el plumbing
  `partyMode`/`choosePartyMode`/`partyStorageKey` fueron ELIMINADOS de App.tsx.
  Los bots siguen existiendo en el motor (bots.ts) por si vuelven como feature.
- Imagen viva de escena: movida del ScenePanel (columna derecha) al
  DungeonMasterPanel (`.dmSceneImage`, CSS al final de app.css). El ScenePanel
  quedó con el asset estático de la campaña como fondo decorativo.
