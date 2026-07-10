# Modelos de IA — qué usamos hoy y qué conviene probar (free tier)

> Actualizado: 2026-07-10. Los límites free cambian seguido: verificar en
> [AI Studio](https://ai.google.dev/gemini-api/docs/rate-limits) y
> [console.groq.com](https://console.groq.com/docs/rate-limits) antes de decidir.

## Qué está corriendo HOY en TinyQuest

| Etapa | Proveedor / modelo | Por qué |
|---|---|---|
| Forja de historia, apertura, recap | **Gemini 2.5 Flash** (`VITE_GEMINI_MODEL`) | Calidad de escritura; pocas llamadas por día |
| Narración por turno (ruta "cheap") | **Groq llama-3.3-70b-versatile** | Velocidad brutal + no gasta el RPD de Gemini |
| Failover | El otro proveedor, automático | Si uno falla o agota cuota |
| Imágenes (retratos, portadas, escenas) | **Pollinations (flux)** | Gratis, sin key, cache IndexedDB por URL |
| Cache de LLM | Proxy de Vite (`/api/groq/chat`, `/api/gemini/chat`) | Mismo prompt = 0 tokens |

## Límites free vigentes (julio 2026)

**Gemini** (el free tier hoy cubre SOLO Flash y Flash-Lite; los Pro pasaron a pago en abril 2026):

| Modelo | RPM | TPM | RPD |
|---|---|---|---|
| Gemini 3 Flash (nuevo, recomendado por Google) | 10 | 250K | **1.500** |
| Gemini 2.5 Flash (el nuestro) | 10-15 | 250K | 250-1.500 según cuenta |
| Gemini 2.5 Flash-Lite | 15-30 | 250K | **1.000+** |

**Groq**:

| Modelo | RPM | TPM | RPD |
|---|---|---|---|
| llama-3.3-70b-versatile (el nuestro) | 30 | 12K | 1.000 |
| llama-3.1-8b-instant | 30 | 6K | **14.400** |
| llama-4-maverick | 15 | 3K | 500 |

**Otros free tiers que existen** (para probar más adelante): Cerebras (llama 70B,
velocidad tipo Groq), Mistral La Plateforme (mistral-small), Cohere (trial
1.000 llamadas/mes), OpenRouter (variantes `:free` de varios modelos, ~50 req/día).

**Sin free tier** (van con la key paga de Fiamy si quiere probarlos): OpenAI
(ChatGPT API) y xAI (Grok 4.5). Ambos hablan el mismo formato de chat que ya
usamos → agregar un endpoint en `groq-dungeon-master.ts` (como está hecho Gemini)
+ `VITE_MASTER_PROVIDER=openai|grok`.

## Recomendación (beneficio × calidad × tokens)

1. **Subir la forja a Gemini 3 Flash** cuando quieras probarlo: mejor prosa y
   1.500 RPD (vs los ~20-250 que veníamos midiendo en 2.5). Es UNA línea:
   `VITE_GEMINI_MODEL=gemini-3-flash` en `.env.local` + reiniciar dev. Si el
   model id no existe en tu cuenta, AI Studio lista el nombre exacto.
2. **Narración por turno queda en Groq 70B** (1.000 RPD sobra para sesiones de
   20+ rondas; ~10-30 turnos narrados por partida).
3. **Tercer nivel de emergencia**: si un día se agota Groq + Gemini, agregar
   Flash-Lite como reserva de narración (1.000 RPD extra, calidad suficiente
   para turnos rutinarios). Pedíselo a Claude: es rutear `route:"cheap"` con un
   modelo más en la cadena de failover.
4. **Imágenes siguen en Pollinations**: gratis y ya cacheadas. Alternativas free
   si un día molesta la cola (20-90s por imagen nueva): Cloudflare Workers AI
   (SDXL, cuota diaria) o Together (flux-schnell con créditos). Cambiarlo es un
   provider nuevo en `packages/atmosphere/` — NO tocar los prompts de
   `portraits.ts` (invalidan el cache).

## Cómo se cambia de modelo (sin tocar código)

```bash
# .env.local
VITE_MASTER_PROVIDER=gemini          # o "groq"
VITE_GEMINI_MODEL=gemini-2.5-flash   # probar: gemini-3-flash
VITE_GROQ_MODEL=llama-3.3-70b-versatile  # probar: llama-3.1-8b-instant (turnos)
```

Reiniciar `npm run dev` después de cambiar (Vite lee env al arrancar; además el
proxy LLM usa las keys del server).
