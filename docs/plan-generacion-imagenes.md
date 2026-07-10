# Plan: mejorar el sistema de generación de imágenes SIN perder el estilo

> Estado: PLAN aprobable, nada implementado (2026-07-10). Cada fase es una
> instrucción autocontenida que se le puede dar a Claude tal cual.
> Regla madre en todo el plan: **el estilo aprobado manda** — pintura al óleo
> oscura de Pollinations flux (`heroPromptRoot`), luz dramática, proporciones
> naturales. Cualquier cambio se compara contra el set dorado ANTES de quedar.

## Estado actual (lo que ya funciona y no se toca)

- Retratos (Frente 3/4 + Cuerpo parado, mismo seed), portada (fondo sin gente +
  avatar real compositado con elipse) y escena viva → **Pollinations flux**.
- Cloudflare flux-schnell solo miniaturas ≤448×288. Cache IndexedDB por URL,
  para siempre. Seeds deterministas. Stale-while-revalidate + spinner.
- Trampa vigente: **cambiar un prompt = invalidar el cache de esa familia**.
  Toda fase que toque prompts debe listar qué cache invalida y avisar.

---

## Fase 0 — El estilo como contrato (base de todo, esfuerzo: chico)

**Problema**: el "ADN de estilo" está repetido en fragmentos por todo
`portraits.ts` (cada template dice a su manera "painted, dramatic light…").
Un retoque distraído en un template rompe la coherencia visual.

**Instrucciones**:
1. Extraer una constante única `STYLE_DNA` en `portraits.ts` (ej.: `"Fantasy
   RPG book illustration, dark moody oil painting, painterly brushwork, muted
   palette with warm accents, dramatic light, natural proportions, rich
   detail, no text"`) y componer TODOS los prompts (héroe, NPC, mascota,
   portada, escena viva, mundos) desde ella. ⚠️ Esto cambia las URLs →
   invalida TODO el cache una única vez: hacerlo temprano y avisar a Fiamy.
2. Crear `docs/estilo/` con 6-8 imágenes DORADAS aprobadas por Fiamy (la elfa
   rubia, el retrato del héroe actual, una portada buena, una escena viva
   buena). Son el criterio de aceptación visual de todas las fases.
3. Escribir en `docs/refactor-map.md`: "ningún cambio de prompt/proveedor se
   mergea sin comparar 3 generaciones contra docs/estilo/ a ojo".

**Criterio de éxito**: regenerar el héroe de Fiamy con el STYLE_DNA nuevo y
que ella no distinga cuál es cuál contra el set dorado.

---

## Fase 1 — Consistencia de personaje (esfuerzo: medio)

**Problema**: Frente y Cuerpo usan el mismo seed y prompt raíz, pero flux a
veces pinta caras distintas; el héroe de la escena viva se parece poco.

**Instrucciones**:
1. **Rasgos ancla**: al completar el look, generar (con el LLM de forja, una
   sola llamada) 3-4 rasgos visuales FIJOS y concretos del héroe — p. ej.
   "cicatriz fina sobre la ceja izquierda, pelo cobrizo con trenza lateral,
   capa gris ceniza con broche de bronce" — y guardarlos en
   `Character.look.anchors` (string). TODOS los prompts del héroe (Frente,
   Cuerpo, escena viva modo 🧝, portada) repiten `anchors` literal. Regla:
   los anchors se generan UNA vez y solo cambian con "Reimaginar".
2. **Historial de reimaginado**: guardar los últimos 3 pares (seed + URLs) en
   `Character.look.history`; UI: flechitas ‹ › junto a "Reimaginar héroe" para
   volver a una cara anterior sin regenerar (es cache, gratis).
3. **NPCs con anclas**: la forja ya exige `appearance` — sumarle al prompt de
   forja que cada appearance incluya UN rasgo distintivo memorable (la
   validación determinista puede chequear que appearance tenga ≥8 palabras).

**Criterio de éxito**: 5 reimaginados seguidos → Frente y Cuerpo se reconocen
como la misma persona en al menos 4; volver atrás con el historial funciona.

**Extensión opcional (paga, decidir Fiamy)**: img2img/IP-Adapter con flux-dev
(fal.ai o Replicate, centavos por imagen): usar el Frente aprobado como imagen
de referencia para generar Cuerpo, escena con héroe y variantes de outfit con
la MISMA cara garantizada. Entra detrás del gate de `fetchViaCloudflare` (vía
proxy `/api/…` con key server-side) y pasa por el set dorado antes de quedar.

---

## Fase 2 — Portada de cine (esfuerzo: medio)

**Problema**: el compositado del héroe quedó digno, pero la figura puede
desentonar en color/luz con la escena y "flota" (no apoya en el piso).

**Instrucciones** (todo en `drawFadedFigure`/`ForgedStoryBanner`, canvas puro,
cero generaciones extra):
1. **Armonización de color**: calcular el color promedio y la luminancia media
   de la franja de escena donde cae la figura; aplicar al retrato un tinte
   `source-atop` de ese color al 10-15% + ajuste de brillo (globalAlpha /
   filter brightness) hacia la luminancia de la escena.
2. **Sombra de contacto**: elipse radial oscura (negro→transparente, alpha
   ~0.45) bajo los pies de la figura, ancho ≈ 60% de la figura.
3. **Unificado final**: sobre el canvas COMPLETO, viñeta sutil (radial oscura
   en bordes, alpha ~0.18) + grano fino (noise canvas al 3-4%) — retrato y
   fondo dejan de leerse como capas.
4. **Título tipografiado al descargar** (opcional): al exportar, dibujar el
   título de la historia en serif dorada (Cinzel) abajo a la izquierda con
   sombra — la portada descargada parece tapa de libro real. En pantalla NO
   (el título ya está en el teaser).

**Criterio de éxito**: captura antes/después con el mismo héroe y escena; la
figura debe verse "dentro" de la escena (Fiamy decide).

---

## Fase 3 — Escena viva que sigue la historia (esfuerzo: medio-alto)

**Problema**: la imagen de escena usa título+objetivo estáticos: no refleja lo
que ACABA de pasar (pista descubierta, NPC en escena, clímax).

**Instrucciones**:
1. Agregar al motor un derivador puro `sceneImageBeat(room): string | null`
   (packages/game-engine): devuelve una frase corta SOLO en momentos clave —
   entrada a escena nueva, pista decisiva descubierta, dangerClock ≥ 7,
   escena final. Si no hay momento clave devuelve null (NO regenerar).
2. `liveSceneImageUrl` acepta `beat?: string` y lo suma al prompt. La URL solo
   cambia cuando hay beat nuevo → el gasto de generaciones queda acotado a
   3-6 por sesión en vez de por turno.
3. El modo 🧝 héroe usa los `anchors` de Fase 1.
4. La galería (ya existe) absorbe las imágenes nuevas — nada que hacer ahí.

**Criterio de éxito**: una partida de 10+ turnos genera ≤6 imágenes de escena
y cada una corresponde a un momento que el jugador recuerda.

---

## Fase 4 — Cuota, espera y compartir (esfuerzo: chico-medio)

**Instrucciones**:
1. **Telemetría local**: contador en localStorage de generaciones por día y
   proveedor + duración promedio; si Pollinations promedia >90s en la sesión,
   mostrar un hint en el spinner ("la cola está pesada hoy…").
2. **Prefetch con prioridades explícitas** al forjar: portada → Frente/Cuerpo
   → NPC principal → escena 1 → resto (hoy es parcial; dejarlo declarado en
   un solo array ordenado).
3. **Cache compartido en la sala**: cuando un invitado entra, el HOST le manda
   por el WebSocket los blobs (base64) de los retratos del elenco ya cacheados
   (mensaje nuevo `asset_pack`, límite ~2MB) — los invitados ven el elenco al
   instante sin regenerar. El server Go solo relaya (ya soporta payloads 1MiB;
   subir `maxMessageSize` a 4MiB).
4. **Export/backup**: botón en Ajustes "Exportar imágenes" → zip de blobs del
   IndexedDB (y su import). Protege las imágenes queridas de un borrado de
   datos del navegador.

**Criterio de éxito**: invitado nuevo en sala ve retratos del elenco <2s;
Fiamy puede exportar/importar su cache.

---

## Fase 5 — Proveedores futuros (solo reglas, esfuerzo: cero hoy)

1. Ningún proveedor nuevo reemplaza a Pollinations silenciosamente: entra por
   un gate como `fetchViaCloudflare`, con su key en `.env.local` server-side,
   y se aprueba contra el set dorado (3 imágenes lado a lado).
2. Candidatos si algún día se paga velocidad+estilo: **fal.ai flux-dev**,
   Together flux-dev, Replicate (todos img2img → habilitan la extensión de
   Fase 1). Grok/OpenAI imágenes: estilo distinto, probarlos solo contra el
   set dorado.
3. CF flux-schnell se queda en miniaturas; si CF publica flux-dev, re-evaluar.

---

## Orden recomendado y qué decide Fiamy

| Orden | Fase | Espera de Fiamy |
|---|---|---|
| 1º | Fase 0 (STYLE_DNA + set dorado) | Elegir las 6-8 imágenes doradas; aceptar UNA invalidación de cache |
| 2º | Fase 2 (portada cine) | Aprobar antes/después |
| 3º | Fase 1 (anclas + historial) | Aprobar rasgos ancla de su héroe |
| 4º | Fase 3 (escena por momentos clave) | Jugar una partida y validar |
| 5º | Fase 4 (cuota + compartir) | — |
| 6º | Fase 5 | Decidir si algún día se paga img2img |

**Riesgos transversales**: (1) toda edición de prompt invalida cache — se
avisa siempre y se agrupa en una sola fase; (2) StrictMode duplica efectos —
los efectos de composición/prefetch deben ser idempotentes; (3) la cola de
Pollinations es variable — nunca bloquear un botón de juego por una imagen.
