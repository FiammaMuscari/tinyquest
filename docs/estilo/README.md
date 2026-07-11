# Set dorado — criterio de aceptación visual

Estas imágenes son el **contrato de estilo** de TinyQuest: el óleo oscuro de
Pollinations flux que aprobó Fiamy (2026-07-10, "me encanta como se ve ahora").
Todo cambio de prompt o de proveedor de imagen se compara contra este set —
3 generaciones lado a lado, a ojo — ANTES de mergear. Ver regla 6 en
`docs/refactor-map.md` y la Fase 0 de `docs/plan-generacion-imagenes.md`.

## Set actual (armado 2026-07-10 con imágenes ya aprobadas)

- [x] `hero-frente.png` — la elfa rubia, retrato 3/4 (el estilo dorado de referencia)
- [x] `hero-cuerpo.png` — elfa pelirroja, figura entera de pie
- [x] `npc-arquetipo.webp` — arquetipo Elfo del Velo (NPC/linaje pre-generado)
- [x] `portada.jpg` — portada "La deuda de ceniza" (elenco, tapa de libro)
- [x] `portada-compositada.jpg` — "El ecosistema silencioso": fondo sin gente +
      avatares reales fundidos con elipse (referencia del compositado de Fase 2)
- [ ] `mundo.png` — **falta**: una card de mundo del lobby que a Fiamy le guste
      (generar una en el juego y copiarla acá cuando aparezca)

Con esto alcanza como línea base. Si querés sumar una mascota o una escena viva
aprobada, copialas acá con nombre claro.

## Cómo comparar

1. Regenerar 3 imágenes con el `STYLE_DNA` actual.
2. Ponerlas al lado de las de este set.
3. Si Fiamy no distingue cuál es la nueva → el estilo se mantuvo, se puede mergear.
