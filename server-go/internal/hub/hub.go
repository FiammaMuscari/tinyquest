package hub

import (
	"crypto/rand"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Hub mantiene el registro de salas y rutea todos los mensajes.
// El servidor NO interpreta el estado del juego: es JSON opaco que el HOST
// (autoritativo) difunde y los invitados consumen.
type Hub struct {
	mu       sync.Mutex
	rooms    map[string]*Room
	upgrader websocket.Upgrader
}

func NewHub() *Hub {
	h := &Hub{
		rooms: make(map[string]*Room),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			// Run local: se aceptan conexiones desde cualquier origen (vite dev, file://…).
			CheckOrigin: func(*http.Request) bool { return true },
		},
	}
	go h.janitor()
	return h
}

// ServeWS es el handler HTTP: upgradea a WebSocket y arranca las bombas.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := newClient(h, conn)
	go c.writePump()
	go c.readPump()
}

// janitor borra salas vencidas (sin actividad por roomTTL).
func (h *Hub) janitor() {
	ticker := time.NewTicker(10 * time.Minute)
	for range ticker.C {
		h.mu.Lock()
		for code, r := range h.rooms {
			if time.Since(r.lastActivity) > roomTTL {
				delete(h.rooms, code)
			}
		}
		h.mu.Unlock()
	}
}

func mustJSON(v any) []byte {
	data, err := json.Marshal(v)
	if err != nil {
		log.Printf("hub: marshal: %v", err)
		return []byte(`{"type":"error","message":"internal","code":"internal"}`)
	}
	return data
}

func (c *Client) sendError(code, message string) {
	c.enqueue(mustJSON(ErrorMsg{Type: SError, Message: message, Code: code}))
}

// handleMessage rutea un mensaje entrante. Todo el estado se toca bajo h.mu:
// el volumen es de mesa de juego (turnos humanos), no hace falta granularidad.
func (h *Hub) handleMessage(c *Client, data []byte) {
	var env Envelope
	if err := json.Unmarshal(data, &env); err != nil {
		c.sendError(ErrInvalidAction, "Mensaje malformado.")
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	switch env.Type {
	case CPing:
		c.enqueue(mustJSON(PongMsg{Type: SPong}))
	case CCreateRoom:
		h.createRoom(c, data)
	case CJoinRoom:
		h.joinRoom(c, data)
	case CRejoinRoom:
		h.rejoinRoom(c, data)
	case CStartStory:
		h.startStory(c, data)
	case CBroadcastGame, CTurnResult:
		h.broadcastGame(c, data)
	case CSubmitAction:
		h.submitAction(c, data)
	default:
		c.sendError(ErrInvalidAction, "Tipo de mensaje desconocido: "+env.Type)
	}
}

// ─── create / join / rejoin ──────────────────────────────────────────────────

func (h *Hub) createRoom(c *Client, data []byte) {
	var msg CreateRoomMsg
	if err := json.Unmarshal(data, &msg); err != nil || strings.TrimSpace(msg.PlayerName) == "" {
		c.sendError(ErrInvalidAction, "create_room necesita playerName y character.")
		return
	}
	code := genCode()
	for h.rooms[code] != nil {
		code = genCode()
	}
	room := newRoom(code)
	room.worldID = msg.WorldID
	room.perspective = msg.Perspective
	host := &player{
		id: genPlayerID(), name: msg.PlayerName, isHost: true,
		character: msg.Character, client: c, connected: true, joinedAt: time.Now(),
	}
	room.players = append(room.players, host)
	h.rooms[code] = room
	c.enqueue(mustJSON(RoomCreatedMsg{Type: SRoomCreated, RoomCode: code, PlayerID: host.id, Players: room.snapshot()}))
}

func (h *Hub) joinRoom(c *Client, data []byte) {
	var msg JoinRoomMsg
	if err := json.Unmarshal(data, &msg); err != nil || strings.TrimSpace(msg.PlayerName) == "" {
		c.sendError(ErrInvalidAction, "join_room necesita roomCode, playerName y character.")
		return
	}
	room := h.rooms[strings.ToUpper(strings.TrimSpace(msg.RoomCode))]
	if room == nil {
		c.sendError(ErrRoomNotFound, "No existe una sala con ese código.")
		return
	}
	if room.status == statusEnded {
		c.sendError(ErrGameEnded, "Esa partida ya terminó.")
		return
	}
	if room.status == statusActive {
		c.sendError(ErrStoryStarted, "La historia ya arrancó: pedile al anfitrión una sala nueva.")
		return
	}
	if len(room.players) >= maxPlayers {
		c.sendError(ErrRoomFull, "La sala está llena (anfitrión + 4 amigos como máximo).")
		return
	}
	guest := &player{
		id: genPlayerID(), name: msg.PlayerName,
		character: msg.Character, client: c, connected: true, joinedAt: time.Now(),
	}
	room.players = append(room.players, guest)
	room.touch()
	players := room.snapshot()
	c.enqueue(mustJSON(RoomJoinedMsg{Type: SRoomJoined, RoomCode: room.code, PlayerID: guest.id, Players: players}))
	joined := mustJSON(PlayerJoinedMsg{Type: SPlayerJoined, Player: players[len(players)-1], Players: players})
	for _, other := range room.connectedClients() {
		if other != c {
			other.enqueue(joined)
		}
	}
}

func (h *Hub) rejoinRoom(c *Client, data []byte) {
	var msg RejoinRoomMsg
	if err := json.Unmarshal(data, &msg); err != nil {
		c.sendError(ErrInvalidAction, "rejoin_room necesita roomCode y playerId.")
		return
	}
	room := h.rooms[strings.ToUpper(strings.TrimSpace(msg.RoomCode))]
	if room == nil {
		c.sendError(ErrRoomNotFound, "Esa sala ya no existe.")
		return
	}
	p := room.findByID(msg.PlayerID)
	if p == nil {
		c.sendError(ErrRoomNotFound, "Ese asiento ya no existe en la sala.")
		return
	}
	if p.client != nil && p.client != c {
		p.client.conn.Close()
	}
	p.client = c
	p.connected = true
	room.touch()
	players := room.snapshot()
	c.enqueue(mustJSON(RoomJoinedMsg{Type: SRoomJoined, RoomCode: room.code, PlayerID: p.id, Players: players}))
	if room.status == statusActive && len(room.lastState) > 0 {
		c.enqueue(mustJSON(StateUpdateMsg{
			Type: SStateUpdate, State: room.lastState, EventSummary: room.lastSummary,
			ActivePlayerID: room.activePlayerID, YourTurn: p.id == room.activePlayerID,
		}))
	}
	back := mustJSON(PlayerBackMsg{Type: SPlayerBack, PlayerID: p.id, Players: players})
	for _, other := range room.connectedClients() {
		if other != c {
			other.enqueue(back)
		}
	}
}

// ─── juego (host autoritativo) ───────────────────────────────────────────────

// roomOfHost devuelve la sala si c es su host; si no, manda el error y nil.
func (h *Hub) roomOfHost(c *Client, code string) *Room {
	room := h.rooms[strings.ToUpper(strings.TrimSpace(code))]
	if room == nil {
		c.sendError(ErrRoomNotFound, "No existe una sala con ese código.")
		return nil
	}
	p := room.findByClient(c)
	if p == nil || !p.isHost {
		c.sendError(ErrNotHost, "Solo el anfitrión puede hacer eso.")
		return nil
	}
	return room
}

func (h *Hub) startStory(c *Client, data []byte) {
	var msg StartStoryMsg
	if err := json.Unmarshal(data, &msg); err != nil || len(msg.State) == 0 {
		c.sendError(ErrInvalidAction, "start_story necesita roomCode y state.")
		return
	}
	room := h.roomOfHost(c, msg.RoomCode)
	if room == nil {
		return
	}
	room.status = statusActive
	room.activePlayerID = msg.ActivePlayerID
	room.lastState = msg.State
	room.touch()
	for _, p := range room.players {
		if p.client == nil || !p.connected {
			continue
		}
		p.client.enqueue(mustJSON(StoryStartedMsg{
			Type: SStoryStarted, State: msg.State,
			ActivePlayerID: msg.ActivePlayerID, YourTurn: p.id == msg.ActivePlayerID,
		}))
	}
}

func (h *Hub) broadcastGame(c *Client, data []byte) {
	var msg BroadcastGameMsg
	if err := json.Unmarshal(data, &msg); err != nil {
		c.sendError(ErrInvalidAction, "broadcast_game malformado.")
		return
	}
	room := h.roomOfHost(c, msg.RoomCode)
	if room == nil {
		return
	}
	room.touch()
	// Señal "narrando" sin estado: los invitados muestran el spinner del narrador.
	if msg.Narrating && len(msg.State) == 0 {
		narrating := mustJSON(NarratingMsg{Type: SNarrating})
		for _, other := range room.connectedClients() {
			if other != c {
				other.enqueue(narrating)
			}
		}
		return
	}
	if len(msg.State) == 0 {
		c.sendError(ErrInvalidAction, "broadcast_game sin state.")
		return
	}
	room.activePlayerID = msg.ActivePlayerID
	room.lastState = msg.State
	room.lastSummary = msg.EventSummary
	for _, p := range room.players {
		if p.client == nil || !p.connected || p.client == c {
			continue
		}
		p.client.enqueue(mustJSON(StateUpdateMsg{
			Type: SStateUpdate, State: msg.State, EventSummary: msg.EventSummary,
			ActivePlayerID: msg.ActivePlayerID, YourTurn: p.id == msg.ActivePlayerID,
		}))
	}
}

func (h *Hub) submitAction(c *Client, data []byte) {
	var msg SubmitActionMsg
	if err := json.Unmarshal(data, &msg); err != nil {
		c.sendError(ErrInvalidAction, "submit_action malformado.")
		return
	}
	room := h.rooms[strings.ToUpper(strings.TrimSpace(msg.RoomCode))]
	if room == nil {
		c.sendError(ErrRoomNotFound, "No existe una sala con ese código.")
		return
	}
	p := room.findByClient(c)
	if p == nil {
		c.sendError(ErrRoomNotFound, "No estás sentado en esa sala.")
		return
	}
	if room.status != statusActive {
		c.sendError(ErrInvalidAction, "La historia todavía no arrancó.")
		return
	}
	if p.id != room.activePlayerID {
		c.sendError(ErrNotYourTurn, "No es tu turno.")
		return
	}
	if !isValidStat(msg.Stat) {
		c.sendError(ErrInvalidAction, "Stat inválido: "+msg.Stat)
		return
	}
	host := room.host()
	if host == nil || host.client == nil || !host.connected {
		c.sendError(ErrInternal, "El anfitrión está desconectado; esperá a que vuelva.")
		return
	}
	room.touch()
	host.client.enqueue(mustJSON(GuestActionMsg{
		Type: SActionRelay, PlayerID: p.id, Action: msg.Action, Stat: msg.Stat, UsePet: msg.UsePet,
	}))
}

// ─── desconexión y gracia ────────────────────────────────────────────────────

func (h *Hub) handleDisconnect(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for code, room := range h.rooms {
		p := room.findByClient(c)
		if p == nil {
			continue
		}
		p.connected = false
		p.client = nil
		room.touch()
		left := mustJSON(PlayerLeftMsg{Type: SPlayerLeft, PlayerID: p.id, Players: room.snapshot()})
		for _, other := range room.connectedClients() {
			other.enqueue(left)
		}
		// Gracia de reconexión: si no vuelve, el asiento se libera; si era el
		// host, la partida no puede seguir y la sala se cierra.
		playerID, roomCode := p.id, code
		time.AfterFunc(gracePeriod, func() { h.expireSeat(roomCode, playerID) })
		return
	}
}

func (h *Hub) expireSeat(roomCode, playerID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.rooms[roomCode]
	if room == nil {
		return
	}
	p := room.findByID(playerID)
	if p == nil || p.connected {
		return
	}
	if p.isHost {
		gone := mustJSON(ErrorMsg{Type: SError, Message: "El anfitrión abandonó la partida.", Code: ErrGameEnded})
		for _, other := range room.connectedClients() {
			other.enqueue(gone)
		}
		delete(h.rooms, roomCode)
		return
	}
	kept := room.players[:0]
	for _, other := range room.players {
		if other.id != playerID {
			kept = append(kept, other)
		}
	}
	room.players = kept
	left := mustJSON(PlayerLeftMsg{Type: SPlayerLeft, PlayerID: playerID, Players: room.snapshot()})
	for _, other := range room.connectedClients() {
		other.enqueue(left)
	}
}

// genPlayerID genera un id corto tipo "p-7f3k9x2m".
func genPlayerID() string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	for i, v := range b {
		b[i] = alphabet[int(v)%len(alphabet)]
	}
	return "p-" + string(b)
}
