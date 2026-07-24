# Refactor map — read this BEFORE exploring the code

Purpose: save exploration cost (tokens/time) on every session. Grep these anchors
instead of reading whole files. **Update this map whenever you move or rename a
section** — an outdated map costs more than no map.

## Estado del proyecto (revisado 2026-07-24)

Health check corrido en esta fecha — no re-verificar sin motivo:

| Señal | Estado |
|---|---|
| Árbol / remote | limpio, `main` == `origin/main` (`fb0ec4e`) |
| `npm test` | **354/354** verde (~30s) |
| `npm run typecheck` | limpio |
| Dev server | vive en 127.0.0.1:5173 (no matarlo si Fiamy juega) |
| Tamaño | App.tsx 4113 líneas · app.css 4370 · assets 15M · media 1.4M |

Roadmap de narración (`memory/project_tinyquest_roadmap.md`) — qué está REALMENTE
cableado, verificado por traza estática en esta fecha:

- **1 Calidad de narración**: hecho (contrato unificado 160-240 palabras, `storySoFar`,
  `max_tokens` 1400). Falta solo el juicio subjetivo de Fiamy jugando.
- **2 Opciones dinámicas**: hecho (`optionsToLabel` con target/intent/risk).
- **3 RAG con embeddings**: hecho y consumido por `buildCompactGroqPrompt` (campos
  `recall` + `moralProfile`). Falta ver recuerdos no-vacíos en partida larga real.
- **4 Talentos**: hecho en solo y **ya también en grupal (arreglado 2026-07-24)**.
  `useTalent` viaja en `submit_action`/`guest_action` (TS `protocol.ts` + Go
  `protocol.go`/`hub.go:372`); el host resuelve el turno del invitado con la
  decisión DEL INVITADO (`onGuestAction` → `runTurn(..., overrideUseTalent)`), no
  con su propio toggle. Antes el host gastaba su talento sin querer.
  Gating de UI: `talentReady` usa `!mpBlockActions` (cada quien dueño del suyo).
  Regresión cubierta en `server-go/internal/hub/hub_test.go` y
  `tests/multiplayer-e2e.test.mjs`.
- **5 Finales dinámicos**: MÁS hecho de lo que dice el roadmap — `generateFinalRecap`
  del provider está cableado end-to-end (`App.tsx:1629`, `groq-dungeon-master.ts:303`,
  `buildFinalRecapContext` + `FINAL_RECAP_RULES` en `llm-budget.ts:328`);
  `buildFinalRecap` (App.tsx:2958) es el fallback local sin LLM.
- **6 Multi-campaña**: sigue siendo solo luna-roja + forja improvisada.

Del spec viejo de Fiamy: acción libre escrita por el jugador **ya existe**
(`customAction`/`encodeCustomAction`, App.tsx:808/1542, cuesta energía);
pistas falsas/verdaderas **ya existen** (`CampaignClue.isFalse`);
**relojes múltiples ya existen** desde 2026-07-24 (ver abajo).

### Relojes de historia (`packages/game-engine/src/clocks.ts`, nuevo 2026-07-24)

Pistas de presión al estilo Blades in the Dark, además del `dangerClock` global.
Tres tipos: `threat` (nace OCULTO, se alimenta de fallos y de subidas de peligro),
`opportunity` (la llena el éxito, nunca retrocede) y `mystery` (solo avanza con
pistas reales reveladas). Tope de **2 segmentos por turno** para proteger el pacing;
un reloj oculto se destapa al llegar a la mitad; al llenarse dispara `payoff`, un flag
`clock_fired:<id>` y un delta de peligro (+2 amenaza / −1 oportunidad / 0 misterio),
y después **queda congelado** (no se cobra dos veces).

Puntos de contacto — si tocás uno, revisá los otros:
- `engine.ts` `resolvePlayerAction`: `advanceClocks` corre **acá**, con el resto de
  los hechos. NO moverlo a `applyNarration`: la narración se genera antes, y el pago
  se narraría siempre un turno tarde. `applyNarration` solo *deriva* los pagos con
  `clock.firedAtTurn === room.turn` y los mete en `memorySummary.stakes`.
- `createClocksForCampaign(campaign)`: usa `campaign.clocks` si están escritos; si no,
  los DERIVA de `threats[0]` / `clues.length` / `forgeNotes.summary.objective` — así
  una historia forjada por LLM tiene presión sin tocar el prompt.
- `llm-budget.ts` (`buildCompactGroqPrompt`): campos `clocks` (máx 4 líneas) y
  `clocksFired`. Regla dura: la presión **se narra, no se reporta** — prohibido decir
  números, segmentos o la palabra "reloj"; los ocultos solo se insinúan.
- UI: `visibleClocks(room?.clocks)` en el `journeyPanel` (App.tsx ~2115, bloque
  `.journeyClocks` antes de `.journeyLaws`). CSS al final de `app.css`.
- Tests: `tests/clocks.test.mjs` (12 casos, transpila `clocks.ts` inline).

**El nombre de un reloj es una ETIQUETA, no una oración** (`clockLabel()` en
`clocks.ts`, aplicado en los 3 sitios donde se arma un `name`). El rail de la partida
mide **279px**: un objetivo tal como lo escribe el LLM ("Impugná la deuda falsa antes
de que el consejo la cobre") parte en dos líneas y el reloj deja de leerse como reloj.
`clockLabel` corta en la primera subordinada (`antes de que`, `para que`, `hasta que`…)
y, si igual pasa de 34 chars, recorta en borde de palabra con `…`. El `payoff` conserva
la frase entera: el recorte es SOLO de UI. Si agregás un cuarto tipo de reloj, pasá su
nombre por `clockLabel` o volverá el wrap.

**Los pips vacíos se ven tanto como los llenos.** Primera versión: `rgba(…, .13)` sin
borde propio → a 0/6 el track era invisible y el bloque parecía una lista de frases.
Ahora el hueco lleva `inset 0 0 0 1px` teñido según el tipo (rojo/oro/verde al 42%) y
el nombre arranca con un punto del color del reloj, para que a 0 segmentos ya se sepa
si juega a favor o en contra. Verificación sin cuota: `node scratchpad/clock-render.mjs`
(markup exacto de la UI + `app.css` real, con rellenos parciales y un reloj `clockFired`).

### Assets huérfanos (medido 2026-07-24, script abajo)

⚠️ **TRAMPA: grepear el nombre CON extensión da falsos positivos masivos.** Casi
todos los assets se referencian por *stem* y la ruta se arma en runtime:
`uiIcon(name)` → `` `/assets/ui/${name}.webp` `` (App.tsx:2387) y `DiceBadge` →
`` `/assets/dice/${kind}.webp` `` (App.tsx:3545). Buscar `d20.webp` no encuentra nada
y parece huérfano cuando en realidad se dibuja en cada tirada.

Huérfanos REALES: eran **6 archivos, ~88K**, todos en `assets/ui/` (`compass-rose`,
`logo`, `step-connector`, `sparkle`, `companeros`, `dice_d20` — este último un
duplicado viejo del d20 que sí se usa en `assets/dice/`). **Ya borrados 2026-07-24.**
Los otros 14 iconos de `assets/ui/` sí se usan vía `uiIcon()`.

**Recomprimido 2026-07-24 (~1.7M ahorrados, sin cambiar código):** los assets venían
del pack a 500-1100px para renders de 25-50px. Se bajaron a ~4x del display real,
que es el techo de cualquier pantalla:

| Asset | Display real (app.css) | Antes | Ahora |
|---|---|---|---|
| `assets/dice/*.webp` | 46px (`.diceBadgeWrap`), 34px (`.miniDiceImageWrap`) | ~1100px, 692K | 184px, 24K |
| `assets/character/talents/*.webp` | 46-52px (`.talentPicker img`) | 500px, 858K | 192px, 53K |
| `assets/character/stats/*.webp` | 25-30px (`.statBarRow img`) | 500px, 230K | 128px, 36K |

**NO tocar** (medido, ya están bien dimensionados):
- `assets/ui/ornamento-{circulo,espada}.webp` (640px): son fondos de `.heroSpecial`
  a `auto 96%` de la altura del panel, que a 1360×700 no pasa de ~670px. Bajarlos se ve.
- `assets/campaigns/*.webp` (1916×821 por ~60K): banners, ya comprimidos finos.
- `assets/audio/song-of-the-north.mp3` (**11M de los 13M**): es la única música del
  juego y **no está en el camino crítico** — los tres reproductores usan
  `preload="none"` (`ui-sound.ts:81`, `App.tsx:2094`, `App.tsx:2942`), así que solo
  baja si Fiamy la enciende. Recomprimir degrada el único track a cambio de nada.

Regla para el futuro: antes de recomprimir, buscá el `width/height` en `app.css` y
multiplicá por 4. Verificá con un render estático a `deviceScaleFactor: 3` contra el
dev server (patrón en `scratchpad/dice-render.mjs` / `scratchpad/icons-render.mjs`) —
no hace falta jugar una partida ni gastar cuota de LLM.

Receta para re-medir huérfanos (match por stem, no por nombre de archivo):
```bash
for f in $(find apps/web/public/assets -type f | sed 's|apps/web/public||'); do \
  s=$(basename "$f" | sed 's/\.[^.]*$//'); \
  grep -rqE "\"$s\"|'$s'|\($s\)|$(basename "$f")" apps/web/src packages scripts apps/web/index.html \
  || echo "HUERFANO: $f"; done
```

### Pase de UI (2026-07-24) — qué se tocó y qué NO

Auditado a 1360×700 con Playwright (`scratchpad/ui-*.mjs`, todo sin gastar cuota de
LLM porque el lobby no llama al modelo). Arreglado:

- **Foco de teclado invisible.** No había NINGUNA regla `:focus-visible` en toda la
  hoja: el anillo era el default del navegador, 1px casi negro sobre fondo casi
  negro. Anillo turquesa `#75eadb` al final de `app.css` (turquesa y no dorado
  porque tiene que leerse también sobre los botones crema `.startHint`).
- **404 en cada carga + `lang="en"`.** `apps/web/index.html` no declaraba favicon,
  así que Chrome pedía `/favicon.ico` y comía un 404 siempre. Se generó
  `favicon.png` (64px) y `apple-touch-icon.png` (180px) a partir del d20, más
  `theme-color`, `description`, y `lang="es"` (el juego es en español).

**NO se tocó, a propósito:**
- La altura del lobby (1479px contra un viewport de 700 = ~2 pantallas de scroll).
  Es una decisión de diseño de Fiamy: el retrato grande es el protagonista y el
  flujo de 3 pasos es explícito. Achicarlo es cuestión de gusto, no un defecto.
- Contraste: la auditoría marcó `.forgeButton` en 1.14, pero es **falso positivo** —
  el fondo es un `linear-gradient` (o sea `backgroundColor: transparent`) y el
  script sube al ancestro oscuro. En pantalla es marrón oscuro sobre dorado.
  Si escribís otro auditor de contraste, resolvé `background-image` antes de creerle.
- El `stepDiamond` desborda 10px del panel a la izquierda: es el número del paso
  colgando en el margen, es intencional.

### Pase de UI — pantalla de PARTIDA (2026-07-24, segunda tanda)

Recién con `scratchpad/ingame.mjs` (entra a la partida con LLM mockeado, cuota cero)
se pudo auditar la pantalla real. Cinco defectos, todos con la misma causa de fondo:
**una regla base genérica pisando un caso particular.**

- **Casilla de "Escribir mi propia acción" de 253px.** `textarea, select, input
  { width: 100% }` (app.css:103) también aplicaba a los `input[type=checkbox]`, así
  que la casilla empujaba su propio texto al otro extremo de la fila. `.petToggle
  input` ya lo parcheaba a mano; ahora hay un reset global de checkbox/radio al final
  de `app.css`. **Si agregás una casilla nueva, ya está cubierta.**
- **"Alma Dracónica" cortada a cuchillo.** `.miniMeters` repartía el carril en 3
  columnas iguales (78px) y el chip del compañero es flex → `text-overflow: ellipsis`
  no se aplica en un contenedor flex. Ahora las columnas son `auto auto minmax(0,1fr)`
  y el nombre va en `.miniMeterName`. Ojo: `.queueCard .miniMeters` (app.css:2806) fija
  las columnas con `!important`, hay que ganarle con su misma especificidad.
- **La chapita del avatar decía "PARTY" en solo.** `localPlayerId` viene de
  `mpState.playerId`, que está vacío fuera de multijugador, así que el propio jugador
  caía en la rama "otro". Además `.queueCard span` le metía `overflow-wrap: anywhere`
  y "PARTY" partía en dos líneas encima del retrato.
- **El carril izquierdo desbordaba 20px** (Leyes cortadas). Se comprimieron las
  escenas futuras (`.journeyPath li.future`) — que ocupaban lo mismo que la escena
  actual — y se acortó el texto vacío de Leyes. Ahora entra justo: 574/576px.
- **Nombres de reloj de dos líneas** → ver la regla de `clockLabel` más arriba.

Auditor reutilizable: `scratchpad/ui-clip2.mjs` compara `scrollWidth/clientWidth` de
todo el DOM. Ignora lo que tenga scroll, `overflow: visible` o `text-overflow:
ellipsis` declarado — sin esos filtros escupe decenas de falsos positivos.

### Avatar de la sala de espera: miniatura por el relay (2026-07-24)

Síntoma: en la sala el avatar de un jugador aparecía a veces de frente y a veces de
cuerpo entero. **No era el servidor** — el hub guarda el `Character` como
`json.RawMessage` opaco y lo retransmite entero, `avatarShot` incluido. El problema es
que el retrato vive en la **IndexedDB de quien lo generó**: los demás navegadores solo
reciben la URL de pollinations y tienen que volver a pedir la imagen (cuota + segundos,
y si la cuota está agotada nunca llega). Mientras tanto `HeroAvatarImg` mostraba la
OTRA toma como puente.

Solución: `look.avatarThumb` — miniatura JPEG data-URI de ~2 KB de la toma elegida,
generada por el dueño con `buildPortraitThumb()` (portraits.ts) desde el blob que ya
tiene cacheado, y transportada dentro del `Character`. Contactos:

- `buildPortraitThumb(url)` NUNCA dispara una generación: lee de IndexedDB o devuelve
  null. Conserva la proporción (128px de lado mayor) — tiene que ser la MISMA foto.
- `look.avatarThumbKey` es un hash de la URL: si no coincide con la toma actual, la
  miniatura está vieja y se ignora/regenera.
- `multiplayerAvatarSignature` incluye `avatarThumbKey` → cambiarla republica el asiento.
- `canonicalMultiplayerCharacter` **descarta la miniatura** si el Character pasa de
  56 KB. El hub rechaza a los 64 KB y un rechazo tira abajo la publicación entera: se
  sacrifica la miniatura, nunca el avatar.
- `MultiplayerAvatarImg` usa la miniatura como respaldo; solo cae a la otra toma si el
  personaje es viejo y no tiene miniatura.
- Verificación en navegador real, sin cuota: `node scratchpad/thumb-check.mjs`.

Prueba de extremo a extremo con el relay Go de verdad: `node scratchpad/lobby-avatar.mjs`
(necesita `npm run dev` en 5173 y `go run ./cmd/server` en 8787). Dos **contextos
aislados**, anfitrión con FRENTE amarilla y CUERPO violeta sembradas en IndexedDB,
invitado con la caché vacía y toda generación cortada. Lee el píxel real dibujado, no
el atributo. Resultado esperado:

```
Annie: miniatura · rgb(232,198,90) · 102x128   ← la FRENTE que eligió el anfitrión
ernie: placeholder · 128x128                   ← sin caché y sin red: marcador de posición
```

Dos trampas que invalidan esta prueba si se repiten:

- `browser.newPage()` **comparte IndexedDB y localStorage**. Hay que usar
  `browser.newContext()` o el "invitado" hereda la caché del anfitrión, que es justo la
  condición que la prueba tiene que descartar.
- Los retratos **no salen por el dominio de pollinations**: van por los proxys del
  propio dev server (`/api/cf-image` y `/api/pollinations`, portraits.ts:288 y :444).
  Bloquear por dominio deja pasar la generación real — el invitado resuelve el retrato
  grande igual, la prueba deja de probar nada y encima gasta cuota.

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
- **MODELO POR STYLE REFERENCES = calidad (2026-07-24, causa raíz del "cuerpo plastilina"):**
  el worker rutea por modelo (`worker.js:182-184`): con `referenceImage` O con
  `styleImages.length` → **flux-2-klein-4b** (óleo pictórico, bueno); sin nada →
  **flux-1-schnell** (plastilina). La cara siempre tuvo style ref
  (`face-style-oil.jpg`) → klein. El cuerpo NO las tenía → schnell → plastilina.
  Fix: `prepareHeroPortraitPair` (App.tsx) ahora hace
  `linkPortraitStyleReferences(urls.fullbody, ["/assets/style/body-style-painterly.jpg","/assets/style/body-style-delicate.jpg"])`.
  Los assets ya estaban en `apps/web/public/assets/style/`. Cualquier retrato que
  deba verse pictórico DEBE tener style refs o cae a schnell. El path klein recorta
  el prompt a **1700 chars** (más agresivo que los 1960 de schnell), por eso el
  cuerpo acota el `appearance` a 980. Las `styleImages` NO van en la URL (van por
  `portraitStyleReferences`), así que la caché IndexedDB del cliente no las ve →
  cambiar el ruteo EXIGE bump de versión (por eso V28→V29) para forzar regeneración.
- **LÍMITE DURO DE PROMPT (2026-07-24):** el Worker (`worker.js` runSchnell) y el
  proxy dev (`vite.config.ts`) cortan el prompt del cuerpo a **1960 chars**, y flux
  (T5) ignora todo lo que pase de ~512 tokens. Como `composeHeroAppearance` ya mide
  ~1.2k chars, los prompts de héroe DEBEN ser magros y front-loaded. Cara = FACE
  DETAIL **V25**; cuerpo = BODY MASTER **V28** (candados en orden: sujeto único →
  encuadre sin pies → estilo óleo anti-3D → adulto+ropa → raza/orejas → identidad →
  negativos). `fullBodyPortraitUrl` recorta el `appearance` a 1020 chars para
  garantizar que TODOS los candados entren en 1960. El género/colores del usuario
  van primeros en `composeHeroAppearance` (verdad absoluta) y se reafirman en el
  candado del cuerpo. `heroCropVersion` mapea V28→"knee" (recorta pies); si subís de
  versión, agregala al regex o se pierde el crop. El test `portrait-prompts` valida
  el fit <=1960 con appearance realista (no "optimizar" sin re-medir).
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
  `heroPortraitNeedsRefresh`; no hace IO ni prefetch. **Guardar** conserva Frente
  y Cuerpo byte por byte; **Reimaginar** usa nonce aleatorio y es la ÚNICA acción
  que puede reemplazar el par. El commit ocurre solo cuando ambas imágenes ya
  cargaron y quedaron cacheadas; error/cuota conserva el par anterior.
  `portraitIdentity` incluye exactamente los campos
  que alimentan el prompt. La curación de templates al arrancar se salta si la
  firma no coincide, porque eso representa una edición pendiente, no una URL
  legacy rota.
- La ficha guardada (incluidas `faceUrl`/`fullBodyUrl`) persiste en localStorage
  además de sessionStorage. Cerrar la pestaña ya no gasta otro par; `Reimaginar`
  sigue siendo la invalidación visual explícita y los blobs viven en IndexedDB.
- `forgeHeroPortraitPair` genera Cuerpo como identidad canónica con Schnell y
  deriva Frente mediante `linkPortraitReference` + Flux.2 Klein 4B. Cuerpo V19 es
  el master completo y Frente V19 su acercamiento 3/4; el Worker copia literalmente
  persona, ropa, armas, colores y cicatrices y cambia SOLO cámara. Esta dirección
  evita el fallo de V18 donde expandir un rostro podía cortar la cabeza.
  Frente es 512². Cuerpo genera una fuente 384×512 (un tile) con rodillas seguras;
  `cropKneeUpPortrait` elimina el 18% inferior y cachea una salida 448×512, por lo
  que ni UI, lightbox ni descarga ven pies. Si Klein
  agota cuota, el Worker cae a Schnell con el mismo prompt; nunca cachea una
  imagen inferior. Mientras termina Frente, `HeroAvatarImg.fallbackUrl` muestra
  el master Cuerpo ya listo en vez de mantener el spinner.
- Frente usa únicamente el master Cuerpo como referencia: no se agregan láminas
  de estilo que puedan contaminar ropa/anatomía. Un fallo de edición con referencia
  nunca cae a text-to-image independiente: reintenta o conserva Cuerpo. El mismo
  contrato aplica al Cuerpo: ningún asset `TINYQUEST HERO ...` cae a Sana si falla
  Cloudflare. Producción y Vite rechazan Frente sin referencia canónica ANTES de
  invocar IA (HTTP 409, cero cuota).
- Permanencia estricta: tabs Raza/Oficio/Compañero, rasgos, stats, Guardar y el
  toggle Frente/Cuerpo no generan ni derivan URLs. El toggle navega solo
  `look.faceUrl`/`look.fullBodyUrl`. Reimaginar prepara un candidato y hace commit
  atómico únicamente cuando las dos tomas quedaron en caché; si una falla conserva
  el par aprobado. El siguiente intento reusa el mismo seed para aprovechar el
  Cuerpo ya cacheado y no duplicar cuota.
- NPC `portraitUrl` se estampa en `forgeStory` desde `appearance + description`.
  Son medallones 448×448 y Schnell usa 6 pasos (héroe/escenas conservan 8): menos
  píxeles y ~25% menos pasos sin perder detalle al tamaño máximo del lightbox.

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
- Two hero variants: face (`characterPortraitUrl`) + knee-up body
  (`fullBodyPortraitUrl`), same seed; Face references Body via img2img.
  `shotToggle` only switches the frozen pair. `avatarShot` lives in
  `Character.look`.
- Quest temper: `getQuestTemper/applyQuestTemper` (engine `quest-temper.ts`) —
  +1 most-demanded stat, −1 least-demanded, from scenes' allowedStats; applied to
  a COPY at `startSolo` (draft untouched); shown as chips in `finalStep`.
- Forge extras (all optional, schema-lax): `Campaign.forgeNotes` carries
  summary{objective,risk,firstMystery,timeLimit}, keywordsUsed[{idea,how}],
  heroBond, evidence[]; NPCs carry bond + whyMightLie (public, no spoilers).
  Forge input now includes `hero` and forbids NPCs reusing the hero's name
  unless bond explains it. maxTokens 4400. `ImprovisedStoryContent.opening`
  trae la apertura en la MISMA llamada y la salida validada se persiste con clave
  `story-v2-opening`; recargar reutiliza la forja. La revisión editorial repite
  llamada solo ante fallos funcionales, no por cosmética de título/prosa.
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
- Héroe: Cuerpo es la generación canónica y Frente su edición img2img 3/4 (no
  recorte CSS). Cuerpo se procesa de cabeza a rodillas. Cloudflare es
  la vía primaria; Pollinations queda como fallback. El par comparte identidad,
  vestuario y seed pero conserva dos encuadres reales.
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

## Performance/cuota/deploy 2026-07-16

- `runTurn`: RAG + llamada del narrador corren en paralelo con los 1250 ms de
  animación de dados. No volver a poner el `await wait` antes de la red.
- Cloudflare y Pollinations comparten la cola prioritaria de `portraits.ts`.
  Héroe visible > escena actual > primer NPC presente > resto en idle.
- La caché edge de imagen se versiona por familia extraída del prompt
  (`hero-body-v22`, `npc-portrait-v17`, `scene-v1`), no con una versión global.
- Ajustes muestra telemetría local de imágenes y los headers de cuota LLM. El
  Worker coalescea POST idénticos, usa timeout 20s, TTL LLM 6h y expone
  `X-Tiny-Quest-Cache`.
- `npm run deploy` ejecuta el check completo. `deploy:check` agrega dry-run y
  `smoke:edge` verifica assets, tres proxies, Pollinations y `/ws` sin gastar IA.
