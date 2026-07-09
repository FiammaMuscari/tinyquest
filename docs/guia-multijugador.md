# Guía: probar TinyQuest en multijugador (host + amigos)

## El stack (qué corre dónde)

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│ NAVEGADOR DEL HOST          │  ws:// │ SERVIDOR DE SALAS (Go)       │
│ React + Vite (:5173)        │◄──────►│ server-go, puerto :8787      │
│ · Motor de juego (TS puro)  │        │ · Salas con código (6 chars) │
│ · Narrador LLM (Gemini/Groq)│        │ · Host + 4 amigos máximo     │
│ · Imágenes (Pollinations)   │        │ · Relay: NO corre el juego   │
│ EL JUEGO CORRE ACÁ          │        │ · Reconexión 5 min de gracia │
└─────────────────────────────┘        └──────────┬───────────────────┘
                                                  │ ws://
                                       ┌──────────▼───────────────────┐
                                       │ NAVEGADORES DE LOS AMIGOS    │
                                       │ Solo mandan su acción y      │
                                       │ reciben el estado del host   │
                                       └──────────────────────────────┘
```

- **Host autoritativo**: el navegador del host forja la historia, resuelve cada
  turno contra el motor y difunde el `GameRoom` completo. Los amigos ven todo lo
  que creó el host (mundo, historia, narración, escenas) sin crear nada.
- **Server Go**: solo coordina (membresía, turnos, reconexión). Por eso el túnel
  del server es liviano: viajan JSONs, no imágenes ni LLM.
- **Escalado con amigos**: con invitados la sesión se alarga sola —
  **mínimo 20 rondas totales** (+2 rondas por escena por invitado) y +10 minutos
  de reloj por invitado. Tope: **host + 4 amigos**.

## 1 · Probar sola en tu máquina (host + invitado)

```bash
# Terminal 1 — servidor de salas
npm run server:go          # ws://localhost:8787

# Terminal 2 — el juego
npm run dev                # http://localhost:5173
```

1. **Pestaña A (host)**: forjá tu héroe (género/piel/ojos/pelo) → `Crear sala`
   → te da un código de 6 letras.
2. **Pestaña B (invitado)**: abrila en **ventana de incógnito** (si no, comparte
   el localStorage y el mismo héroe) → forjá otro héroe → `Unirse con código`.
3. **Host**: cuando veas a los dos en la lista → `Empezar aventura (2/5)`.
   Si el mundo elegido no tiene historia, la forja ahí mismo (LLM).
4. Juegan por turnos: cuando es turno del otro ves "Turno de X…" en la barra
   dorada; el que tiene el turno elige acción y tira dados.

**Checklist de lo que tiene que pasar:**
- [ ] El invitado ve el código de sala y la lista de jugadores en la espera.
- [ ] Al arrancar, el invitado ve el MISMO mundo/historia/apertura que el host.
- [ ] La barra dorada muestra "Sala: XXXXXX · N en línea" y de quién es el turno.
- [ ] El invitado NO puede tirar dados fuera de su turno.
- [ ] Cuando el host narra, el invitado ve "Narrando…".
- [ ] Si cerrás la pestaña del invitado, el host ve que se desconectó; si vuelve
      dentro de los 5 minutos, se reengancha.

## 2 · Probar con amigos por internet (túneles)

Necesitás exponer DOS puertos: `5173` (el juego) y `8787` (las salas).

### Opción A — VS Code Ports (la más simple)

1. En VS Code: panel **PORTS** (junto a la terminal) → `Forward a Port`.
2. Forwardeá `5173` y `8787`, y poné ambos en **Visibility: Public**.
3. VS Code te da dos URLs tipo `https://xxxx-5173.devtunnels.ms`.
4. El cliente toma la URL del server de `VITE_WS_URL`. Creá/editá `.env.local`:

```bash
# .env.local (agregá esta línea; el resto no se toca)
VITE_WS_URL=wss://xxxx-8787.devtunnels.ms
```

5. Reiniciá `npm run dev` (Vite solo lee env al arrancar) y pasale a tus amigos
   la URL `https://xxxx-5173.devtunnels.ms`.

> Ojo: con túnel HTTPS el WebSocket DEBE ser `wss://` (no `ws://`), si no el
> navegador lo bloquea por contenido mixto.

### Opción B — ngrok

```bash
# Terminal 3 y 4 (además del server y el dev)
ngrok http 5173
ngrok http 8787
```

Tomá las dos URLs `https://…ngrok-free.app`, poné la del 8787 en `VITE_WS_URL`
(con `wss://`), reiniciá `npm run dev` y compartí la del 5173.

> El plan gratis de ngrok corre 1 túnel por agente: abrí dos terminales, o usá
> un `ngrok.yml` con dos túneles y `ngrok start --all`.

### Opción C — misma red WiFi (LAN, sin túnel)

```bash
VITE_WS_URL=ws://TU_IP_LOCAL:8787 npm run dev -- --host
# tus amigos entran a http://TU_IP_LOCAL:5173
```

(`ip addr | grep "inet "` para ver tu IP local.)

## 3 · Cambiar la IA del motor narrativo

Todo el LLM vive en `packages/ai-master/` (el resto del juego no sabe qué modelo
corre). La selección es por variables en `.env.local`:

```bash
VITE_MASTER_PROVIDER=gemini          # proveedor principal
VITE_GEMINI_API_KEY=...              # tu key actual
VITE_GEMINI_MODEL=gemini-2.5-flash   # override opcional
VITE_GROQ_API_KEY=...                # failover + narración por turno (ruta "cheap")
VITE_GROQ_MODEL=llama-3.3-70b-versatile
```

Cómo está repartido hoy (para cuidar el free tier de Gemini, RPD 20/día):
- **Forja de historia + apertura + recap** → Gemini (calidad).
- **Narración por turno** → Groq primero (ruta `"cheap"`), Gemini de reserva.
- Si un proveedor falla, hace failover al otro automáticamente.

**Para probar OpenAI (ChatGPT) o Grok (xAI) más adelante**: los dos exponen API
compatible con el formato de chat de Groq/OpenAI, así que el camino es agregar
en `groq-dungeon-master.ts` un endpoint más (como está hecho el de Gemini) con
`VITE_MASTER_PROVIDER=openai|grok` + `VITE_OPENAI_API_KEY` / `VITE_XAI_API_KEY`.
Pedímelo cuando tengas la key y lo cableo — es un cambio chico porque todo pasa
por `callGroqWithFailover`.

## 4 · Cambiar la IA de imágenes

Hoy: **Pollinations** (gratis, sin key, modelo flux) — `apps/web/src/portraits.ts`.
Cache en IndexedDB por URL: una imagen generada queda para siempre.

⚠️ **Trampa**: los prompts de `portraits.ts` son la KEY del cache. Cambiar el
texto del prompt invalida TODAS las imágenes ya generadas. Para probar otro
proveedor (DALL·E, Imagen, Grok imágenes), lo correcto es agregar un provider
paralelo en `packages/atmosphere/` o una rama nueva en `portraits.ts` detrás de
`VITE_IMAGE_PROVIDER`, sin tocar los templates existentes.

## 5 · Tests automáticos del multijugador

```bash
npm run server:go:test                       # hub Go (salas, turnos, tope 4 amigos)
node --test tests/multiplayer-e2e.test.mjs   # server Go real + cliente TS real
node --test tests/party-scaling.test.mjs     # escalado ≥20 rondas con amigos
npm test                                     # suite completa
```

## Problemas conocidos

| Síntoma | Causa | Arreglo |
|---|---|---|
| Invitado clavado en "Conectando…" | server Go no corre | `npm run server:go` |
| "No se pudo conectar con el servidor de salas" desde afuera | `VITE_WS_URL` no apunta al túnel o es `ws://` sobre HTTPS | usar `wss://` + reiniciar dev |
| El invitado ve tu mismo héroe | misma pestaña/perfil de navegador | incógnito u otro navegador |
| "La sala está llena" | ya hay host + 4 | es el tope por diseño |
| "La historia ya arrancó" | se unieron tarde | crear sala nueva |
