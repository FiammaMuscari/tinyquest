# Tiny Quest — servidor de salas (Go)

Relay **host-autoritativo** sobre WebSocket para jugar en party. El juego (motor +
narrador LLM) corre en el navegador (TypeScript); este proceso **no** interpreta
el estado: coordina la sala, la membresía, el orden de turnos y la reconexión, y
relaya. El HOST forja la historia, resuelve cada turno contra el motor y difunde
el estado autoritativo; los invitados mandan su acción y reciben el estado.

## Correr (local)

```bash
npm run server:go            # ws://localhost:8787   (o: cd server-go && go run ./cmd/server)
PORT=9000 npm run server:go  # otro puerto
npm run server:go:test       # tests del hub
```

El front toma la URL de `VITE_WS_URL` (default `ws://localhost:8787`). Para dos
jugadores en la misma máquina: abrí dos pestañas en `http://localhost:5173`, una
crea sala y la otra se une con el código.

## Protocolo (JSON sobre WebSocket)

Cliente → servidor: `create_room`, `join_room`, `rejoin_room`, `start_story`,
`broadcast_game`, `submit_action`, `ping`.

Servidor → cliente: `room_created`, `room_joined`, `player_joined`,
`player_left`, `player_reconnected`, `story_started`, `state_update`,
`narrating`, `guest_action` (solo al host), `error`, `pong`.

Debe quedar sincronizado con `apps/web/src/multiplayer/protocol.ts` — mismos
nombres de tipo y campos. El test `tests/multiplayer-e2e.test.mjs` levanta este
binario y maneja el cliente TS real contra él para garantizarlo.

## Estructura

```
cmd/server/main.go        → arranque HTTP + WebSocket (/ y /healthz)
internal/hub/protocol.go  → tipos de mensaje + códigos de error
internal/hub/hub.go       → registro de salas, ruteo, desconexión/gracia
internal/hub/room.go      → sala: asientos, código dictable, snapshot
internal/hub/client.go    → conexión WebSocket (read/write pumps, ping/pong)
internal/hub/hub_test.go  → tests de integración del hub
```

## Reglas

- Código de sala: 6 caracteres sin `I/O/0/1` (se dictan sin confusión).
- Máximo 6 jugadores (host + 5). TTL de sala 2 h. Gracia de reconexión 5 min.
- Si el host se cae y no vuelve en la gracia, la sala se cierra.
- El estado del juego (`GameRoom`) viaja como JSON opaco (≤ 1 MiB).
