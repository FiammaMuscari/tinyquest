---
campaignId: luna-roja
sceneId: bosque-rojo
kind: scene
tags: [bosque, bestia, rastro_lunar, combate]
---
# El Bosque Rojo

## Resumen literario
El bosque no ruge; escucha. Entre los pinos hay lana enganchada, cera negra en la corteza y un rastro frio que no pertenece a ninguna bestia viva. La criatura aparece por partes: primero el peso en las ramas, despues el olor a hierro mojado, al final los ojos. No busca matar a todos. Busca empujarlos lejos del archivo y dejar suficiente miedo para que la aldea termine el trabajo.

## Acciones recomendadas
- id: trace_cold_wax; label: Rastrear la cera fria hasta el escondite de la herramienta; type: magic; stat: alma; difficulty: 13; stakes: encontrar origen lunar; success: abre ritual_tool_trace; partial: rastro abre ruta pero marca al caster; failure: bestia embosca; d6CostUse: energia o criatura; revealsClue: ritual_tool_trace; opensRoute: chapel_confession; dangerDeltaOnSuccess: 0; dangerDeltaOnPartial: 1; dangerDeltaOnFailure: 2; exhaustionReplacementSuccess: comparar cera con vela del archivo; exhaustionReplacementFailure: seguir a la bestia herida
- id: pin_beast_between_pines; label: Encerrar a la bestia entre dos pinos sin matarla; type: combat; stat: cuerpo; difficulty: 14; stakes: saber si obedece a alguien; success: bestia deja collar de plata; partial: retrocede y aprende olor del grupo; failure: hiere a un testigo; d6CostUse: combate; affectsObject: silver_collar; dangerDeltaOnSuccess: 0; dangerDeltaOnPartial: 1; dangerDeltaOnFailure: 2; exhaustionReplacementSuccess: leer el collar; exhaustionReplacementFailure: proteger al herido

## Anti repeticion
Cada combate repetido escala: medir, herir, revelar controlador, cierre o huida.
