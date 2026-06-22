---
campaignId: luna-roja
sceneId: cadaver-bajo-el-molino
kind: scene
tags: [molino, cadaver, garra_falsa, turba, prueba]
---
# El Cadaver Bajo el Molino

## Proposito dramatico
Separar el crimen real de la explicacion facil antes de que la aldea arruine la prueba.

## Resumen literario
El molino esta detenido, y eso asusta mas que el cuerpo. La rueda gotea despacio sobre la espalda del molinero, la harina se pega al barro como yeso viejo y las antorchas de la plaza se acercan por la calle baja. Las marcas del cadaver parecen de garra solo si se miran desde lejos; de cerca tienen una paciencia humana, una distancia medida, una limpieza que ningun animal conserva al matar. El Lobo Acusado esta atado al poste de carga, no suplica: mira la cuerda de la campana cortada como si alli hubiera quedado la unica persona que podria salvarlo. Cada accion debe proteger una prueba, calmar una garganta o impedir que alguien meta la bota donde todavia habla el barro.

## Acciones recomendadas
- id: compare_cuts; label: Comparar los cortes con la cuerda de campana; type: investigate; stat: mente; difficulty: 12; stakes: confirma fabricacion; success: descubre patron ritual; partial: patron visible pero barro contaminado; failure: turba pisa la zona; d6CostUse: prueba danada; revealsClue: fake_claws; opensRoute: red_forest_shortcut; dangerDeltaOnSuccess: 0; dangerDeltaOnPartial: 1; dangerDeltaOnFailure: 2; exhaustionReplacementSuccess: confrontar al cazador que reconoce el patron; exhaustionReplacementFailure: reconstruir el barro con testigo
- id: hold_mob_line; label: Contener a la turba sin acusar todavia al alcalde; type: protect; stat: cuerpo; difficulty: 12; stakes: ganar tiempo social; success: turba retrocede; partial: exige promesa; failure: hostilidad sube; d6CostUse: faccion hostil; affectsNPC: accused_wolf; dangerDeltaOnSuccess: -1; dangerDeltaOnPartial: 1; dangerDeltaOnFailure: 2; exhaustionReplacementSuccess: pedir testimonio publico; exhaustionReplacementFailure: abrir paso hacia la capilla
- id: question_mill_boy; label: Convencer al aprendiz del molino de hablar antes de que lo escondan; type: social; stat: alma; difficulty: 11; stakes: obtener testigo; success: menciona linterna azul; partial: habla si protegen a su madre; failure: huye; d6CostUse: NPC ausente; revealsClue: ritual_tool_trace; dangerDeltaOnSuccess: 0; dangerDeltaOnPartial: 1; dangerDeltaOnFailure: 1; exhaustionReplacementSuccess: llevar al aprendiz ante Mara; exhaustionReplacementFailure: seguir sus huellas

## Transiciones
Exito: bosque-rojo. Parcial: bosque-rojo con peligro +1. Fallo: forced_trial o capilla si el acusado confia.

## Anti repeticion
Estudiar la misma marca dos veces confirma; tercera vez se agota y debe usarse testigo u objeto.
