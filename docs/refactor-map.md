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
6. **El estilo de imagen es un contrato.** Todos los prompts de Pollinations se
   componen desde la constante `STYLE_DNA` en `apps/web/src/portraits.ts` — nunca
   escribir fragmentos de estilo sueltos en un template. Ningún cambio de prompt o
   de proveedor de imagen se mergea sin comparar 3 generaciones contra `docs/estilo/`
   (el set dorado aprobado por Fiamy) a ojo. Cambiar `STYLE_DNA` o cualquier prompt
   **invalida el cache** de esa familia de imágenes: avisar siempre y agruparlo.

## apps/web/src/App.tsx — grep anchors

| Anchor (grep) | What lives there |
|---|---|
| `function App()` | All state, turn flow, `forgeStory`, `startSolo`/`launchSolo`, hero portrait save/reimagine, column drag |
| `function LobbyScreen` | World cards, perspective/party pills, forge input, `ForgeRitual`, `forgedTeaser` (chips → `CharacterPeekModal`), hero summary |
| `function CharacterDesigner` | Hero forge: identity + portrait + Reimaginar, tabs Raza/Oficio/Compañero, stat bars, talents |
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
- Cloudflare Schnell es la vía primaria; el Worker cachea globalmente cada imagen
  por SHA-256 del payload completo (prompt+seed+referencias), y el navegador la
  cachea además en IndexedDB. Pollinations es solo fallback: ahí la concurrencia
  DEBE seguir en 1, timeout 120s y reintentos [0, 5s, 15s]. No "optimizar" un
  prompt sin versión/migración: cambia la URL y su entrada de caché local.
- Un 429 de Workers AI bloquea la vía inferior hasta el próximo reset UTC: el
  hook programa el reintento exacto y NO cachea una imagen Sana peor. No volver a
  apagar `cfImageAvailable` permanentemente ante cuota; 501/404 sí apagan el proxy.
- Cast portraits are prefetched at game start (effect in `App()` keyed on
  `room?.selectedCampaignId`); its styleHint must stay identical to CastPanel's.
- La forja exige `appearance` con TIPO explícito (mujer, hombre, hombre
  afeminado, andrógino/intersexual, criatura, híbrido o fenómeno). El motor lo
  completa determinísticamente con `canonicalVisualAppearance` si el LLM lo
  omite. `beingPortraitUrlWithContext` combina esa ficha con la descripción
  visible y rutea humanos, criaturas/híbridos y fenómenos a prompts separados;
  una amenaza como “Viento de los Portales” nunca recibe un rostro humano.
- Hero look picker (`lookPicker` in CharacterDesigner): gender/skin/eyes stored in
  `Character.look` (optional, engine types.ts) — traits go FIRST in the prompt
  (`heroPortraitSpec`). Choosing a trait calls `onUnlockAutoPortrait` (exits
  manual/classic-avatar mode). `petPortraitUrl` gives the companion its own
  creature image (designer pet tab, hero summary, queue). `loadPortrait`/hook
  accept `{ priority: true }` — hero portraits jump the download queue.
- El par del héroe está congelado mientras se edita. Cambiar raza, oficio,
  concepto, stat dominante, género, piel, ojos, pelo o cicatriz solo marca
  `heroPortraitNeedsRefresh`; no hace IO ni prefetch. **Guardar** aplica las
  opciones con el mismo `portraitNonce` (preserva identidad); **Reimaginar** usa
  nonce aleatorio (cara nueva). `portraitIdentity` incluye exactamente los campos
  que alimentan el prompt. La curación de templates al arrancar se salta si la
  firma no coincide, porque eso representa una edición pendiente, no una URL
  legacy rota.
- `forgeHeroPortraitPair` genera Frente como identidad canónica con Schnell y
  deriva Cuerpo mediante `linkPortraitReference` + Flux.2 Klein 4B. En V14 la
  instrucción de cámara LONG SHOT vive al principio del prompt: evita el bug
  histórico "cuerpo == frente" causado por truncar el encuadre después de 1960
  caracteres. Si Klein agota cuota, el Worker cae a Schnell con el mismo prompt;
  nunca cae a una imagen inferior que luego quede cacheada.
- Cuerpo suma dos referencias estéticas JPEG comprimidas mediante
  `linkPortraitStyleReferences`: son STYLE ONLY (pincel, silueta elegante y ropa
  medieval), mientras Frente/colores/especie/cicatriz/armas mandan como identidad.
  No conectar estas referencias al Frente ni a NPCs: gastaría cuota y copiaría
  anatomía femenina/elfa donde no corresponde.
- NPC `portraitUrl` se estampa en `forgeStory` desde `appearance + description`.
  Son medallones 512×512: mismo detalle facial con menos generación desperdiciada.

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
- Guía de juego con amigos + túneles + cambio de proveedor de IA:
  `docs/guia-multijugador.md`. Escalado de sesión con invitados:
  `packages/game-engine/src/party-scale.ts` (≥20 rondas totales, host+4;
  el pacing usa max(scene.maxRounds, sessionConfig.maxRoundsPerScene)).
  Vite permite hosts de túnel (allowedHosts en vite.config.ts).
- Tema por compañera: `petThemes`/`petThemeVars` en App.tsx (junto a
  `companionLogos`) — Alma turquesa, Polilla VIOLETA, Sabueso DORADO; CSS
  "Tema por compañera" al final de app.css (vars --pet-color/--pet-border/--pet-glow).
- Sonido: clicks DEFAULT OFF (`uiSoundEnabled` exige localStorage "on"); ambiente
  ya era opt-in. Compañeras: los PNG de /assets/companions fueron REPROCESADOS
  con máscara circular (transparente fuera del círculo del emblema) — no
  restaurar los viejos. `img.npcPortrait[src^="/assets/companions/"]` sin sombra.
- Héroe (REVERTIDO 2026-07-10 tarde): Frente y Cuerpo son DOS generaciones con
  el mismo seed/prompt raíz (characterPortraitUrl 3/4 cintura + fullBodyPortraitUrl
  parado), SIEMPRE vía Pollinations flux — es EL estilo que Fiamy quiere (pintura
  oscura al óleo). El experimento "frente = recorte CSS del cuerpo" se veía peor.
- Teaser: emojis → iconos lucide (`.tIcon`, colores por card: misión dorado,
  en-juego turquesa, contra-vos rojo); título serif con llama. CTA social
  `.inviteCta` en el paso 4 (abre sala + código; usa onMultiplayerHost/mpBlocked).
- Portada: `drawFadedFigure` usa máscara ELÍPTICA + recorte lateral 16% — los
  retratos ya no se ven como rectángulos pegados. Informe de modelos free:
  `docs/modelos-ia.md`.

## Gameplay 2026-07-10 (noche)

- Reloj POR TURNO (`turnStartedAt` en App): se resetea con cada turno; a cero se
  sortea una opción visible al azar (solo actúa la máquina del jugador activo).
- Galería de escena: `sceneGallery`/`galleryIndex` en App — cada imagen generada
  se ACUMULA; nav ‹ › (`.dmSceneNav`) en `dmSceneImage`. Reset por room.id.
- Animales: `npcAnimalProfile` (campaigns.ts) — el motor no genera "Presionar a
  <gato>" (campaigns.ts opción social + room-state follow-up pasan a
  observar/seguir señales, stat mente); prompts (apertura, turno, forja)
  prohíben diálogo hablado de animales. `clampText` corta en fin de oración
  (nunca más "…y una…").
- Mid-join: sala con "puerta" (host la abre/cierra desde la barra Party,
  `set_room_options`/`room_options` en ambos protocolos). El tardío entra,
  recibe el estado y MIRA; el host lo integra tras ≥2 turnos con
  `addPartyMember` (engine.ts: entra a la rotación + hecho narrativo de llegada
  para que el narrador teja la entrada). `pendingSeatsRef`/`integrateArrivals`
  en App; banner `.midJoinBanner` para el que espera.
- Unirse con código exige héroe completo (mpBlocked también en ese botón) y la
  pantalla de ingreso muestra tu héroe (`.mpHeroCard`).
- OJO tests: room-state.ts ahora importa "./campaigns" — los tests que lo
  transpilan necesitan el replacement 'from "./campaigns"' → campaigns.mjs.
- Imágenes rápidas (2026-07-10): proxy `/api/cf-image` en vite.config (Cloudflare
  Workers AI, SDXL-lightning; credenciales CF_* en .env.local, server-side).
  `fetchViaCloudflare` en portraits.ts intenta CF PRIMERO (parsea prompt/seed/
  tamaño de la URL de Pollinations — la clave de caché NO cambia) y cae a
  Pollinations ante cualquier fallo. ~2s vs 20-90s. Sin credenciales: 501 y se
  apaga solo para la sesión.

- Imágenes por proveedor (regla vigente 2026-07-10 noche): TODO lo visible de la
  historia (retratos 512×768, portada 1120×480, escena viva 512×288) va por
  Pollinations flux — el estilo pintado que aprobó Fiamy ("me encanta como se
  ve"). Cloudflare (flux-1-schnell) queda SOLO para miniaturas ≤448×288
  (arquetipos, mapas). El gate vive en fetchViaCloudflare — no lo aflojes sin
  preguntarle a Fiamy: la calidad manda sobre la velocidad.
- Portada (definitivo 2026-07-10): fondo "lugar sin gente" (storySceneImageUrl,
  prompt original → cache de fondos válido) + SOLO el héroe compositado con su
  avatar REAL elegido (Frente o Cuerpo, hero.avatarUrl) vía drawFadedFigure
  (máscara elíptica, recorte lateral 16%). NPCs NO se pegan (quedaban como
  recortes). Cambiar Frente/Cuerpo recompone la portada.
- ⚠️ 2026-07-11: Pollinations RETIRÓ flux (models = ["sana"], calidad inferior,
  cola 1/IP con 429). Vía principal AHORA: Cloudflare flux-1-schnell steps 8
  para TODOS los tamaños (gate abierto en fetchViaCloudflare); proxy /api/cf-image
  agrega ", no text, no signature, no watermark" server-side (la clave de caché
  del cliente no cambia). Proxy /api/pollinations (dev server) + espera paciente
  de 429 quedan como último recurso. Imágenes cacheadas: intactas.
