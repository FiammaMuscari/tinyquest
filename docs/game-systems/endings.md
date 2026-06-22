# Tiny Quest — resolución de finales

El final no depende solo de que el DM escriba un recap. El motor evalúa una capa explícita de `EndingResolution` después de cada turno aplicado.

## Flujo

1. Resolver dados.
2. Narrar turno con DM.
3. Aplicar cambios de estado: pistas, peligro, memoria, rutas, progreso.
4. Evaluar si la escena actual es final.
5. Si corresponde, seleccionar ending.
6. Guardar `room.endingResolution` y `room.finalEnding`.
7. Marcar `room.sessionComplete = true`.
8. Bloquear acciones normales.
9. Renderizar pantalla de final.

## Cuándo se resuelve final

Una escena cuenta como final si:

- está marcada como final;
- su id/título/objetivo contiene `juicio` o `final`;
- es la última escena de la campaña;
- el walkthrough define `finalSceneId`.

En escena final se resuelve ending si:

- `round >= maxRounds`;
- peligro está crítico (`9-10`);
- el reloj de escena está lleno;
- hay ruta final/secret abierta y 3+ pistas confirmadas;
- el último patch trae señal explícita de ending score.

Importante: peligro `7-8` no fuerza final por sí solo, pero puede dejar endings disponibles.

## Selector

Prioridades:

1. `secret_deep_truth` si hay verdad alta, 3+ pistas y ruta secreta abierta.
2. corrupto si corrupción domina.
3. trágico si peligro >= 9 o caos alto.
4. bueno si verdad + misericordia dominan.
5. heroico si verdad + sacrificio dominan.
6. falso si baja verdad y alta violencia.
7. agridulce como fallback.

## UI

Si `endingResolution.shouldEnd` es true:

- no se muestran botones de acción normal;
- se muestra título y narración de final;
- se listan recompensas, pérdidas y marcas persistentes;
- se habilita volver a campañas o jugar otra ruta.
