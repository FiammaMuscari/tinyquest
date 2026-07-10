package hub

import "encoding/json"

// Protocolo de mensajes Tiny Quest (JSON sobre WebSocket).
//
// ARQUITECTURA — hub HOST-AUTORITATIVO:
//   El motor de juego y el narrador (LLM) son TypeScript y viven en el navegador.
//   El servidor Go NO corre el juego: coordina salas, membresía, orden de turnos,
//   reconexión y RELAY. El HOST corre la partida (forja la historia main, resuelve
//   cada turno, narra) y difunde el estado; los invitados mandan sus acciones y
//   reciben el estado. Cada jugador construye su propio héroe y lo trae al unirse.
//
// Un mensaje entrante se decodifica primero a Envelope para leer "type" y luego
// al struct concreto. Los salientes se serializan directo.

// Envelope lee el discriminador "type" de cualquier mensaje.
type Envelope struct {
	Type string `json:"type"`
}

// ─── Cliente → Servidor ──────────────────────────────────────────────────────

const (
	CCreateRoom     = "create_room"      // el host abre una sala y trae su héroe
	CJoinRoom       = "join_room"        // un invitado entra con código + su héroe
	CRejoinRoom     = "rejoin_room"      // un jugador vuelve a su asiento tras caerse
	CSetRoomOptions = "set_room_options" // (host) abre/cierra la puerta a mitad de partida
	CStartStory     = "start_story"      // (host) la historia main está forjada; a jugar
	CBroadcastGame  = "broadcast_game"   // (host) difunde el estado autoritativo del juego
	CSubmitAction   = "submit_action"    // (invitado) manda su acción de turno al host
	CTurnResult     = "turn_result"      // (host) resultado del turno + de quién es el próximo
	CPing           = "ping"
)

// CreateRoomMsg — el host abre la sala trayendo su Character (JSON opaco: lo define
// el motor TS; el servidor no lo interpreta, solo lo transporta y reparte).
type CreateRoomMsg struct {
	PlayerName string          `json:"playerName"`
	Character  json.RawMessage `json:"character"`
	// WorldID/perspective ayudan al host a forjar; el server solo los guarda para
	// mostrarlos en el lobby de sala. Opcionales.
	WorldID     string `json:"worldId,omitempty"`
	Perspective string `json:"perspective,omitempty"`
}

// JoinRoomMsg — un invitado entra con el código y su propio héroe.
type JoinRoomMsg struct {
	RoomCode   string          `json:"roomCode"`
	PlayerName string          `json:"playerName"`
	Character  json.RawMessage `json:"character"`
}

// RejoinRoomMsg — un jugador que se cayó vuelve a su asiento con su playerId.
type RejoinRoomMsg struct {
	RoomCode string `json:"roomCode"`
	PlayerID string `json:"playerId"`
}

// SetRoomOptionsMsg — el host configura la sala en caliente.
type SetRoomOptionsMsg struct {
	RoomCode     string `json:"roomCode"`
	AllowMidJoin bool   `json:"allowMidJoin"`
}

// StartStoryMsg — el host avisa que la historia main quedó forjada; el server pasa
// la sala a "active" y difunde el arranque. El payload es el estado inicial del juego.
type StartStoryMsg struct {
	RoomCode string          `json:"roomCode"`
	State    json.RawMessage `json:"state"`
	// ActivePlayerID = a quién le toca primero (el host decide el orden).
	ActivePlayerID string `json:"activePlayerId"`
}

// BroadcastGameMsg — el host difunde el estado autoritativo del juego a todos.
type BroadcastGameMsg struct {
	RoomCode       string          `json:"roomCode"`
	State          json.RawMessage `json:"state"`
	EventSummary   string          `json:"eventSummary,omitempty"`
	ActivePlayerID string          `json:"activePlayerId"`
	Narrating      bool            `json:"narrating,omitempty"`
}

// SubmitActionMsg — un invitado manda su acción; el server la relaya al host.
type SubmitActionMsg struct {
	RoomCode string `json:"roomCode"`
	Action   string `json:"action"`
	Stat     string `json:"stat"`
	UsePet   bool   `json:"usePet"`
}

// TurnResultMsg — atajo opcional: el host manda el resultado de un turno puntual.
// Equivale a un BroadcastGame; se mantiene por claridad de intención.
type TurnResultMsg = BroadcastGameMsg

// ─── Servidor → Cliente ──────────────────────────────────────────────────────

const (
	SRoomCreated  = "room_created"
	SRoomJoined   = "room_joined"   // al invitado: entraste, esperá el arranque
	SPlayerJoined = "player_joined" // a todos: fulano entró con su héroe
	SPlayerLeft   = "player_left"
	SPlayerBack   = "player_reconnected"
	SStoryStarted = "story_started" // a todos: la historia arrancó, estado inicial
	SStateUpdate  = "state_update"  // a todos: nuevo estado del juego
	SRoomOptions  = "room_options"  // a todos: la puerta se abrió/cerró
	SNarrating    = "narrating"     // a todos: el host está narrando
	SActionRelay  = "guest_action"  // AL HOST: un invitado pidió esta acción
	SError        = "error"
	SPong         = "pong"
)

// PlayerInfo es la vista pública de un jugador (sin ws).
type PlayerInfo struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	IsHost    bool            `json:"isHost"`
	Connected bool            `json:"connected"`
	Character json.RawMessage `json:"character"`
}

type RoomCreatedMsg struct {
	Type     string       `json:"type"`
	RoomCode string       `json:"roomCode"`
	PlayerID string       `json:"playerId"`
	Players  []PlayerInfo `json:"players"`
}

type RoomJoinedMsg struct {
	Type     string       `json:"type"`
	RoomCode string       `json:"roomCode"`
	PlayerID string       `json:"playerId"`
	Players  []PlayerInfo `json:"players"`
}

type PlayerJoinedMsg struct {
	Type    string       `json:"type"`
	Player  PlayerInfo   `json:"player"`
	Players []PlayerInfo `json:"players"`
}

type PlayerLeftMsg struct {
	Type     string       `json:"type"`
	PlayerID string       `json:"playerId"`
	Players  []PlayerInfo `json:"players"`
}

type PlayerBackMsg struct {
	Type     string       `json:"type"`
	PlayerID string       `json:"playerId"`
	Players  []PlayerInfo `json:"players"`
}

type StoryStartedMsg struct {
	Type           string          `json:"type"`
	State          json.RawMessage `json:"state"`
	ActivePlayerID string          `json:"activePlayerId"`
	YourTurn       bool            `json:"yourTurn"`
}

type StateUpdateMsg struct {
	Type           string          `json:"type"`
	State          json.RawMessage `json:"state"`
	EventSummary   string          `json:"eventSummary,omitempty"`
	ActivePlayerID string          `json:"activePlayerId"`
	YourTurn       bool            `json:"yourTurn"`
}

type NarratingMsg struct {
	Type string `json:"type"`
}

type RoomOptionsMsg struct {
	Type         string `json:"type"`
	AllowMidJoin bool   `json:"allowMidJoin"`
}

// GuestActionMsg — el server le entrega al HOST la acción pedida por un invitado,
// con QUIÉN la pidió, para que el host la resuelva contra el motor.
type GuestActionMsg struct {
	Type     string `json:"type"`
	PlayerID string `json:"playerId"`
	Action   string `json:"action"`
	Stat     string `json:"stat"`
	UsePet   bool   `json:"usePet"`
}

type ErrorMsg struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Code    string `json:"code"`
}

type PongMsg struct {
	Type string `json:"type"`
}

// Códigos de error estables para el cliente.
const (
	ErrRoomNotFound  = "room_not_found"
	ErrRoomFull      = "room_full"
	ErrNotYourTurn   = "not_your_turn"
	ErrInvalidAction = "invalid_action"
	ErrGameEnded     = "game_ended"
	ErrStoryStarted  = "story_started"
	ErrNotHost       = "not_host"
	ErrInternal      = "internal"
)

var validStats = map[string]bool{
	"body": true, "mind": true, "charm": true, "creativity": true,
	"courage": true, "focus": true, "luck": true,
}

func isValidStat(s string) bool { return validStats[s] }
