---
description: Launch TinyQuest dev server and verify it's running
---

# Run TinyQuest

## Launch

```bash
cd /home/fiamy97/Descargas/Tinyquest/Tinyquest && npm run dev 2>&1 &
```

Wait ~8 seconds, then verify:

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/
```

Expected: `200`

## Details

- Root: `/home/fiamy97/Descargas/Tinyquest/Tinyquest`
- Script: `npm run dev` → runs `npm --workspace apps/web run dev` → `vite --host 127.0.0.1`
- URL: http://127.0.0.1:5173/
- Vite config: `apps/web/vite.config.ts` (no custom port, defaults to 5173)

## Kill existing server before restarting

```bash
kill $(ss -tlnp | grep 5173 | grep -oP 'pid=\K\d+') 2>/dev/null; sleep 1
```

## Notes

- The `--host` and `--port` flags passed via CLI are ignored when using `--workspace`; the vite config controls host (`127.0.0.1`) via the `server.host` default.
- The `GROQ_API_KEY` env var must be in `.env.local` at the repo root for AI narration to work.
