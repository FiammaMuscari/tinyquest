# Deploy y coherencia local ↔ producción

## Dónde vive prod

- **URL:** https://tinyquest.fiammamuscari.workers.dev/
- **Runtime:** un único **Cloudflare Worker** (`apps/edge-worker/src/worker.js`) que además sirve el build de `apps/web/dist` como assets (SPA). Config: `apps/edge-worker/wrangler.jsonc`.

## Cómo desplegar

```bash
npm run deploy
```

Ese script hace, en orden (falla y aborta si algo no pasa):

1. `npm run typecheck` — TypeScript sin emitir.
2. `npm test` — toda la suite `node:test`.
3. `npm run server:go:test` — tests del server de multijugador (Go).
4. `npm run build` — genera `apps/web/dist`.
5. `wrangler deploy --config apps/edge-worker/wrangler.jsonc` — sube worker + assets a Cloudflare.

> `npm run deploy:check` hace lo mismo con `--dry-run` (no publica): útil para validar antes de soltar el deploy real.

CI (`.github/workflows/ci.yml`) corre en cada push a `main` pero **solo hace dry-run**: nunca despliega solo. El deploy a prod es siempre manual con `npm run deploy`.

## Qué necesitás la primera vez

1. **Login de wrangler** (una vez por máquina):
   ```bash
   npx wrangler login
   ```
2. **Secrets del Worker** (narración LLM en prod). No van en `wrangler.jsonc`, se cargan cifrados:
   ```bash
   npx wrangler secret put GROQ_API_KEY   --config apps/edge-worker/wrangler.jsonc
   npx wrangler secret put GEMINI_API_KEY --config apps/edge-worker/wrangler.jsonc
   ```
3. **Imágenes en prod: no requieren key.** El Worker genera imágenes con el binding `AI` de Cloudflare Workers AI (ver `ai.binding` en `wrangler.jsonc`). No usa `CF_ACCOUNT_ID` ni `CF_AI_TOKEN` — esos son **solo para local** (ver abajo).

## Coherencia local ↔ prod (lo importante)

El bug recurrente fue que **local se veía distinto a prod**, así que no se podía testear-verificar-pushear con confianza. La causa: local y prod construían el prompt/modelo de imagen por separado y se desincronizaban.

Ahora hay **una sola fuente de la decisión de imagen**:

```
apps/edge-worker/src/image-plan.js  →  planImage({ prompt, width, height, seed, hasReference, styleCount, envModel })
```

`planImage()` decide **todo lo que afecta al resultado**: qué modelo (`flux-2-klein-4b` pictórico vs `flux-1-schnell`), el texto final del prompt, los recortes de longitud, los pasos (6 medallón / 8 héroe) y el índice de las style references.

Los dos lados **importan la misma función** y solo difieren en el **transporte**:

| | Archivo | Transporte hacia Cloudflare |
|---|---|---|
| **Prod** | `apps/edge-worker/src/worker.js` | binding `env.AI.run(...)` (no necesita keys) |
| **Local (dev)** | `apps/web/vite.config.ts` (`/api/cf-image`) | REST `api.cloudflare.com` con `CF_ACCOUNT_ID` + `CF_AI_TOKEN` |

Como la **decisión** sale de `image-plan.js` en ambos, la imagen que ves en `localhost:5173` es la misma que sale en el Worker. El test `tests/image-plan.test.mjs` y `tests/portrait-prompts.test.mjs` blindan que ninguno de los dos vuelva a duplicar esa lógica inline.

### Para probar imágenes reales en local

En `.env.local` (raíz del repo):

```
CF_ACCOUNT_ID=5deea910d099cd09c21d8e601c180f5c
CF_AI_TOKEN=<token de Cloudflare con permiso Workers AI>
```

Sin esas variables el middleware responde 501 y el cliente cae a Pollinations (solo formato de URL, calidad menor). **Estas keys nunca se necesitan en prod.**

## Ver los cambios ya desplegados

Después de `npm run deploy`, abrí https://tinyquest.fiammamuscari.workers.dev/.

Ojo con las **cachés**:
- El Worker cachea cada imagen por SHA-256 de su payload (prompt + seed + refs + styleImages).
- El navegador cachea por URL en IndexedDB (prompt + seed, **sin** styleImages).

Por eso, cuando cambia el prompt o el ruteo de estilo, se **sube la versión** del prompt (p. ej. `HERO BODY MASTER V29`) para forzar regeneración. Si no ves el cambio, es caché vieja: probá con una identidad nueva o revisá que la versión del prompt haya subido.
