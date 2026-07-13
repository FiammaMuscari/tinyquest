# Despliegue sin depender del dev server

`apps/edge-worker/` porta los cuatro endpoints de Vite y el relay de salas a
Cloudflare. El motor y el estado siguen en el navegador; el Worker oculta
claves, cachea llamadas y retransmite bytes. Las salas usan WebSocket en `/ws`
y un Durable Object SQLite (`RoomHub`), así que producción no depende del
proceso Go ni de VS Code.

```bash
npx wrangler secret put GROQ_API_KEY --config apps/edge-worker/wrangler.jsonc
npx wrangler secret put GEMINI_API_KEY --config apps/edge-worker/wrangler.jsonc
npm run deploy
```

El mismo Worker sirve `apps/web/dist` y ejecuta primero las rutas `/api/*`.
Cloudflare Workers AI entra mediante el binding `AI`, por lo que no necesita
`CF_ACCOUNT_ID` ni `CF_AI_TOKEN`. Esto mantiene las URLs relativas y evita CORS. Los secretos
deben rotarse desde los paneles de cada proveedor; revocar primero cualquier
token que se haya pegado en un chat. `.env.local` permanece ignorado por Git.

`npm run deploy` también aplica la migración `v1-room-hub` la primera vez. El
build de producción elige automáticamente `wss://<mismo-host>/ws`; no configures
`VITE_WS_URL` para Cloudflare. `npm run server:go` queda como relay local para
`npm run dev` y para los tests.

Antes de publicar: `npm run build`, smoke test de los cuatro endpoints y límites
de gasto/cuota en Cloudflare, Gemini y Groq.
