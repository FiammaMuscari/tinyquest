# Tiny Quest MVP

## UI rediseñada

- Top: escena actual, ronda, reloj de peligro d10 y tiempo restante de la sesión.
- Izquierda: cola de turnos con jugador actual, siguiente jugador, bots, mascota, vitalidad y energía.
- Centro: escena, objetivo, pistas y acciones múltiples.
- Centro inferior: acción elegida, stat, habilidad, mascota y explicación de dados.
- Derecha: Dungeon Master IA con secciones cortas en español.
- Bottom: resultado de dados, stat seleccionada, habilidad, mascota y consecuencia.
- Abajo: creación de personaje, progresión de habilidad y modo solo local.

## Componentes

- `TopStatus`
- `TurnQueue`
- `ScenePanel`
- `ActionComposer`
- `DungeonMasterPanel`
- `DiceResultBar`
- `CharacterDesigner`
- `AbilityProgressionPanel`
- `SetupPanel`

## Tipos principales

- `DiceType`
- `RollResult`
- `Stats`
- `Species`
- `Role`
- `LegendaryPet`
- `AbilityProgression`
- `Character`
- `Player`
- `BotPlayer`
- `Scene`
- `SceneActionChoice`
- `GameRoom`
- `GameEvent`
- `CheckResult`
- `ConsequenceResult`
- `NarrationRequest`
- `NarrationResponse`
- `StateSuggestion`
- `DungeonMasterProvider`

## Flujo de turno

1. El motor identifica escena y jugador activo.
2. El jugador elige una acción guiada de la escena.
3. El jugador elige stat, habilidad y opcionalmente mascota.
4. El motor valida que la stat sea válida para la escena.
5. El motor tira d20.
6. El motor agrega d4 si la acción encaja con creatividad, habilidad o mascota.
7. El motor calcula éxito, éxito parcial o fallo.
8. Si hay parcial o fallo, tira d6 de consecuencia.
9. El motor actualiza peligro, progreso, pistas y log.
10. El motor crea `NarrationRequest`.
11. `GroqDungeonMasterProvider` genera narración en español con JSON validado.
12. Zod valida `NarrationResponse`.
13. El motor valida sugerencias antes de aplicarlas.
14. Avanza turno, ronda, escena o recap final.

## Mascotas legendarias

- Tienen habilidad pasiva, habilidad activa, stat preferida y cooldown futuro.
- En MVP, activar mascota agrega contexto a la acción y puede justificar +1d4.
- El motor conserva el resultado real; el narrador solo lo vuelve mágico.

## Progresión

- Cada personaje tiene `AbilityProgression`.
- Muestra habilidad actual, siguiente mejora, escalado y condición de desbloqueo.
- En MVP es visible y preparada para incrementarse con éxitos por escena.

## Atmósfera por escena

Cada escena define `SceneAtmosphere`:

- `visualPrompt`
- `ambientSoundPrompt`
- `imageAssetUrl`
- `audioAssetUrl`
- `atmosphereTags`
- `fallbackImage`
- `fallbackAudio`

Providers MVP:

- `MockImageProvider`
- `MockSoundProvider`

Providers futuros:

- `BedrockImageProvider`
- `ElevenLabsSoundProvider`
- `LocalStableDiffusionProvider`

La UI muestra imagen de escena en el panel central y un control de ambiente con play/pause, volumen y nombre de escena. No hay autoplay; el usuario debe interactuar primero. Si el audio falla, la partida sigue en silencio.

## Temática actual

La temática principal ya no es sopa/cocina. El default actual es dungeon fantasy:

- lobos espectrales
- espadas
- travesías
- traiciones
- noviazgos secretos
- trampas
- tesoros
- mascotas legendarias
- almas dragón
- fantasmas
- zombies

Sesión default: `La Saga del Lobo y las Almas Dragón`.

## Ejemplos de narración por tema

### La Corte de Sangre sin Rey

Narración: El Salón sin Reflejos guarda silencio cuando la copa del rey aparece vacía, aunque nadie vio caer el cuerpo. Los espejos muestran culpables distintos y todos bajan la mirada salvo la condesa viuda.  
Diálogo: "El rey no murió", susurra el mayordomo inmortal, "solo dejó de pertenecer a esta noche."  
Consecuencia: Si fallan, una familia rival gana influencia y oculta una pista.  
Opciones: interrogar al heredero sin reflejo, revisar los espejos, bailar con la cazadora.

### El Asesino de la Luna Roja

Narración: Bajo el molino, la nieve roja conserva huellas de garra demasiado perfectas. El joven licántropo tiembla, pero no de culpa: alguien falsificó la bestia.  
Diálogo: "Yo mordí a alguien", admite, "pero no a la víctima."  
Consecuencia: Si fallan, el pueblo exige una ejecución antes de la siguiente luna.  
Opciones: revisar huellas, calmar a la sospechosa, buscar la carta quemada.

### La Máscara del Duque Asesino

Narración: El duque cae en medio del vals y su máscara sigue sonriendo desde el suelo. Nadie grita al principio; en la corte, incluso el miedo espera permiso.  
Diálogo: "La última danza no fue con su esposa", dice el bardo espía.  
Consecuencia: Si fallan, dos invitados intercambian máscaras y coartadas.  
Opciones: analizar la copa, seguir a la máscara de cisne, pedir una danza a la princesa sin nombre.

## Bedrock / ElevenLabs futuro

Por ahora usar:

```env
MASTER_PROVIDER=groq
IMAGE_PROVIDER=mock
SOUND_PROVIDER=mock
VITE_MASTER_PROVIDER=groq
VITE_IMAGE_PROVIDER=mock
VITE_SOUND_PROVIDER=mock
```

Para Bedrock después:

```env
MASTER_PROVIDER=bedrock
IMAGE_PROVIDER=bedrock
SOUND_PROVIDER=elevenlabs
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=
BEDROCK_MODEL_ID_IMAGE=
AWS_BEARER_TOKEN_BEDROCK=
ELEVENLABS_API_KEY=
```

Alternativa con credenciales AWS estándar:

```env
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
```

Las variables se obtienen en AWS Console: habilitar el modelo en Amazon Bedrock, elegir región compatible, copiar el model id y configurar credenciales o Bedrock API key. Nunca hardcodear secretos.
