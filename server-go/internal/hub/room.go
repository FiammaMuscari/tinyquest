package hub

import (
	"crypto/rand"
	"encoding/json"
	"sync"
	"time"
)

// codeAlphabet evita I/O/0/1 para que los códigos se dicten sin confusión.
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const (
	codeLen     = 6
	maxPlayers  = 5 // host + 4 invitados (regla de Fiamy: 4 amigos máximo por host)
	roomTTL     = 2 * time.Hour
	gracePeriod = 5 * time.Minute // reconexión tras caída
)

type roomStatus int

const (
	statusWaiting roomStatus = iota // esperando que el host arranque la historia
	statusActive                    // historia en curso
	statusEnded
)

// player es un asiento en la sala. character es JSON opaco (lo define el motor TS).
type player struct {
	id        string
	name      string
	isHost    bool
	character json.RawMessage
	client    *Client // puede ser nil si está desconectado (en gracia)
	connected bool
	joinedAt  time.Time
}

// Room es una sala multi-jugador. El HOST es autoritativo del estado de juego.
// Un solo mutex protege el estado mutable; los envíos a clientes se hacen fuera
// del lock cuando es posible para no bloquear.
type Room struct {
	mu             sync.Mutex
	code           string
	status         roomStatus
	worldID        string
	perspective    string
	players        []*player // players[0] es siempre el host
	activePlayerID string
	narrating      bool
	// openDoor: el host permite que entren jugadores con la historia YA empezada
	// (el motor del host integra al recién llegado tras un par de turnos).
	openDoor     bool
	createdAt    time.Time
	lastActivity time.Time
	// lastState/lastSummary: última difusión autoritativa del host. Se guarda para
	// re-sincronizar a un jugador que reconecta a media partida.
	lastState   json.RawMessage
	lastSummary string
}

func newRoom(code string) *Room {
	now := time.Now()
	return &Room{
		code:         code,
		status:       statusWaiting,
		players:      make([]*player, 0, maxPlayers),
		createdAt:    now,
		lastActivity: now,
	}
}

func (r *Room) touch() { r.lastActivity = time.Now() }

func (r *Room) host() *player {
	if len(r.players) == 0 {
		return nil
	}
	return r.players[0]
}

func (r *Room) findByID(id string) *player {
	for _, p := range r.players {
		if p.id == id {
			return p
		}
	}
	return nil
}

func (r *Room) findByClient(c *Client) *player {
	for _, p := range r.players {
		if p.client == c {
			return p
		}
	}
	return nil
}

// snapshot arma la lista pública de jugadores (sin ws) para difundir.
func (r *Room) snapshot() []PlayerInfo {
	out := make([]PlayerInfo, 0, len(r.players))
	for _, p := range r.players {
		out = append(out, PlayerInfo{
			ID: p.id, Name: p.name, IsHost: p.isHost,
			Connected: p.connected, Character: p.character,
		})
	}
	return out
}

// connectedClients devuelve los clientes vivos (para difundir sin tener el lock).
func (r *Room) connectedClients() []*Client {
	out := make([]*Client, 0, len(r.players))
	for _, p := range r.players {
		if p.client != nil && p.connected {
			out = append(out, p.client)
		}
	}
	return out
}

func genCode() string {
	b := make([]byte, codeLen)
	_, _ = rand.Read(b)
	out := make([]byte, codeLen)
	for i, v := range b {
		out[i] = codeAlphabet[int(v)%len(codeAlphabet)]
	}
	return string(out)
}
