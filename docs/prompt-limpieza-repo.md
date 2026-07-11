# Prompt: gran limpieza del repo (assets + código muerto + escalabilidad)

> Copiar y pegar tal cual a Claude cuando se quiera ejecutar. Está calibrado a
> las trampas reales de ESTE repo (leer las advertencias del final antes).

---

Hacé una limpieza profunda y ordenamiento del repo TinyQuest, en una rama nueva
`chore/limpieza-repo`, con estas reglas y en este orden:

## 0 · Red de seguridad (antes de tocar nada)

1. Corré y anotá el estado base: `npm run typecheck`, `npm test`,
   `npm run server:go:test`, `node --test tests/multiplayer-e2e.test.mjs`,
   `npm run build` (anotá el peso del bundle). TODO verde antes de empezar.
2. Creá la rama `chore/limpieza-repo` desde main. **Prohibido reescribir la
   historia ya pusheada de main** (nada de rebase/force-push sobre main): el
   "rebase" acá significa entregar una serie de commits limpios y temáticos en
   la rama, que se mergean a main con fast-forward o merge normal.
3. Después de CADA categoría de borrado: typecheck + suite + build. Si algo
   rompe, revertí esa categoría completa antes de seguir.

## 1 · Inventario (medir antes de cortar)

1. Listá el peso por carpeta (`du -sh` de apps, packages, server, server-go,
   docs, apps/web/public/assets/*) y los 30 archivos más pesados.
2. Detectá código muerto TS con evidencia de grep (no confíes en herramientas
   ciegas): exports de packages/* que nadie importa, componentes/funciones de
   App.tsx sin call sites, archivos enteros sin importadores.
3. Detectá assets no referenciados: por cada archivo bajo
   `apps/web/public/assets/` y `apps/web/public/media/`, grep de su ruta (y de
   su nombre base) en `apps/web/src/**`. ⚠️ OJO: hay rutas construidas
   dinámicamente — `uiIcon(...)`, `ARCHETYPE_ASSETS`, `companionLogos`,
   `campaign-assets.ts`, `character-assets.ts`, audio en `ui-sound.ts` — un
   asset "sin referencias" puede estar referenciado por concatenación. Antes de
   borrar, verificá contra esos mapas/helpers uno por uno.
4. Detectá dependencias de package.json (raíz y workspaces) que nadie importa.
5. Armá una TABLA con TODO lo candidato a borrar/mover (ruta, motivo, evidencia,
   riesgo) y mostrámela ANTES de borrar nada. Espera mi ok si algo es dudoso;
   lo obvio (evidencia sólida) procedelo directo.

## 2 · Borrados conocidos (candidatos ya identificados, verificar y ejecutar)

- `server/` (stub TS de multiplayer): superseded por `server-go/`. Verificá que
  nada lo importe, borrá el workspace, sus deps (`tsx`, `tsconfig.server.json`
  si solo lo usa él), y los scripts `server:dev`/`server:install` del
  package.json raíz. Actualizá CLAUDE.md.
- `apps/web/public/assets/avatars/avatar-1..5.webp`: retirados (el placeholder
  es el busto SVG "POR FORJAR"). Verificá que `avatarOptions` ya no tenga uso
  real (queda un check legacy en el efecto de retrato — limpialo también) y
  borrá los 5 webp + la constante.
- Código muerto documentado en campaigns.ts: las campañas
  `dukes-last-mask`/`buried-crown` que el array reemplaza a mitad de archivo
  (docs/refactor-map.md las marca como dead code). Verificá con tests que
  ninguna se usa y borralas.
- Restos del experimento de compositado viejo o CSS huérfano: clases en
  app.css cuyo selector no aparece en ningún TSX (grep por nombre de clase).
  Borrá solo las que tengan CERO usos.

## 3 · Reordenar assets (estructura escalable)

1. Estructura objetivo bajo `apps/web/public/`:
   `assets/{brand,archetypes,companions,campaigns,worlds,ui,audio}` — todo en
   kebab-case, sin espacios ni mayúsculas. Movés un archivo → actualizás TODAS
   las referencias (incluidos los mapas dinámicos) en el mismo commit.
2. Optimizá imágenes sin cambio visual: PNG → oxipng/pngquant si ahorra >20%,
   fotos → webp calidad 82+. NO toques dimensiones. Anotá bytes antes/después.
3. Audio: dejá solo los formatos que el código usa.

## 4 · Orden de código y docs (sin refactor de comportamiento)

1. **NO fragmentes App.tsx** (es monolítico a propósito) y **NO reordenes
   app.css** (hay zonas de guerra por orden: `.gameFrameResizable` debe quedar
   último entre reglas de layout; los bloques nuevos van AL FINAL con banner
   fechado). Limpieza permitida: borrar bloques CSS muertos, unificar
   comentarios banner duplicados.
2. `docs/`: consolidá — refactor-map.md (mapa), guia-multijugador.md (jugar con
   amigos), modelos-ia.md (proveedores), plan-generacion-imagenes.md (plan).
   Si hay docs viejos que se contradicen con estos, actualizalos o borralos.
   CLAUDE.md: actualizá el árbol del monorepo a la realidad post-limpieza.
3. `tests/`: nombres consistentes `*.test.mjs`; borrá helpers duplicados solo
   si el reemplazo queda probado.
4. `scripts/` y archivos sueltos de la raíz: todo lo que no corre desde npm
   scripts ni docs, a la tabla de candidatos.
5. Agregá un script `npm run check` = typecheck + test + server:go:test (la
   verificación completa en un comando).

## 5 · Entrega

1. Commits temáticos separados: `chore(server): retirar stub TS`,
   `chore(assets): borrar avatares retirados + optimizar imágenes (−X MB)`,
   `chore(css): purgar clases muertas`, `docs: actualizar mapa y CLAUDE.md`…
2. Verificación final completa (los 5 comandos del paso 0) + smoke visual en
   navegador a 1360×700: lobby, editar héroe, forjar historia, unirse con
   código, una partida de 2 turnos. Compará el peso del bundle y del repo
   contra la base.
3. Mergeá la rama a main SIN reescribir historia y pusheá.
4. Resumen final: tabla de lo borrado/movido (archivos, MB ahorrados, deps
   quitadas), lo que quedó pendiente por dudoso, y actualización de
   docs/refactor-map.md con cualquier ancla que haya cambiado.

## ⚠️ Advertencias no negociables de ESTE repo

- Los prompts de `portraits.ts` son CLAVES DE CACHE: ni renombrarlos ni
  "prolijarlos" — cualquier cambio de string invalida las imágenes de Fiamy.
- `.env.local` jamás se toca ni se commitea. Los PNG de
  `assets/companions/` ya fueron reprocesados (máscara circular): no
  restaurar versiones viejas desde git.
- El juego es español-first: no "traduzcas" strings de UI.
- Dev con StrictMode: efectos idempotentes; no "simplifiques" los checks de
  identidad de retratos (seed-stripped compare).
- Si un borrado te genera 1% de duda, va a la tabla de candidatos, no a rm.
