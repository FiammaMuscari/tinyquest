# Tiny Quest — peligro, historia, NPCs y tragedia

Este documento fija reglas de pacing para que una partida corta tenga tensión sin quemar el final demasiado pronto.

## Peligro

El peligro es un reloj de 0 a 10. Representa presión narrativa, no solo daño.

| Valor | Banda | Uso narrativo |
| --- | --- | --- |
| 0-3 | Bajo | Hay margen para investigar, negociar, preparar ventajas y hablar con NPCs. |
| 4-6 | Medio | Los costes pesan más. Los NPCs reaccionan, ocultan cosas o piden precio. |
| 7-8 | Alto | La amenaza actúa. Rutas menores se cierran. Cada fallo puede doler. No cierra escena automáticamente. |
| 9-10 | Crítico | Crisis inmediata. Puede forzar avance, cierre, persecución, ataque, incendio, ejecución o revelación forzada. |

### Escalado por ronda

Para evitar que la mesa llegue a 10 antes de entender la historia:

- El peligro ganado por fallos/consecuencias está limitado a **+2 por ronda completa**.
- Los fallos siguen importando, pero el reloj no se dispara por tres malos turnos seguidos de jugador + bots.
- El DM puede narrar presión fuerte en 7-8, pero no debe declarar final salvo que el motor marque cierre.

## Avance y final

Una escena avanza si ocurre al menos una de estas condiciones:

- ronda actual `>= maxRounds`;
- peligro crítico (`9-10`);
- reloj/progreso de escena lleno;
- avance forzado explícito de walkthrough o contenido.

En la escena final, una tirada exitosa puede cerrar la quest si ya hay suficiente historia en mesa:

- al menos 3 pistas descubiertas; o
- ya pasó una ronda dentro de la escena final; o
- el peligro está crítico.

Esto evita finales instantáneos sin contexto, pero no vuelve invisible el cierre.

## NPCs presentes

Cada escena debe intentar tener NPCs activos, no solo como nombres de fondo.

En peligro bajo/medio pueden:

- charlar con tensión;
- ofrecer ayuda con precio;
- mentir por miedo;
- preguntar algo incómodo;
- negociar una tregua;
- revelar una duda parcial.

En peligro alto/crítico pueden:

- ponerse hostiles;
- desesperarse;
- traicionar;
- cerrar una ruta;
- huir;
- proteger a alguien equivocado;
- exigir una decisión pública.

El prompt del DM recibe `presentNpcs` y `npcInteractionRule` para sostener estas interacciones.

## Muerte trágica de compañeros

Los compañeros bot pueden morir, pero debe sentirse excepcional y dramático.

Condiciones actuales:

- debe ser un bot;
- debe estar vivo;
- peligro crítico (`9-10`);
- resultado de fallo;
- consecuencia grave alta (`d6` de 5 o 6);
- el motor marca el hecho como irreversible.

Cuando ocurre:

- el compañero queda con `status: "dead"`;
- su vitalidad pasa a 0;
- se agrega un flag `companion_dead:<id>`;
- se saltea su turno futuro;
- la UI muestra `Caído trágicamente`;
- el DM no puede curarlo, revivirlo ni tratarlo como desmayo.

## Principio de contenido

Cada turno debería agregar al menos una de estas capas:

1. dato concreto de misterio;
2. reacción de NPC;
3. cambio de relación entre compañeros;
4. coste o ventaja persistente;
5. señal de final posible.

Si una escena llega al final sin suficientes pistas, el cierre debe ser más amargo, falso o costoso.

## Energía y vitalidad

Los recursos visibles en la cola de turnos son parte del sistema, no decoración.

### Energía

Cada opción tiene coste mecánico:

- acciones de investigación o charla tranquila: `0` energía;
- magia, mascota o escape: `1` energía;
- pelea, defensa o riesgo alto: `2` energía.

La UI debe mostrar el coste debajo del texto de la opción. Si un personaje no puede pagar, la opción aparece deshabilitada. Los bots también filtran acciones que no pueden pagar.

Las consecuencias pueden quitar energía adicional. Por ejemplo, un coste de d6 puede dejar al personaje sin aire en el peor momento.

### Vitalidad

La vitalidad baja por consecuencias físicas graves o muerte trágica. Si un compañero muere, su vitalidad queda en `0` y su turno se saltea.

### Layout de recursos

En la cola de turnos, vida, energía y mascota se muestran apiladas debajo del avatar/nombre para que no compitan horizontalmente con textos largos de especie, rol o estado.
