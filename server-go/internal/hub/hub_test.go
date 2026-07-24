package hub

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// dial abre un cliente WebSocket contra el servidor de prueba.
func dial(t *testing.T, srv *httptest.Server) *websocket.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(srv.URL, "http")
	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	return c
}

func send(t *testing.T, c *websocket.Conn, v any) {
	t.Helper()
	if err := c.WriteJSON(v); err != nil {
		t.Fatalf("write: %v", err)
	}
}

// recv lee el próximo mensaje y devuelve su map genérico + el campo "type".
func recv(t *testing.T, c *websocket.Conn) (string, map[string]any) {
	t.Helper()
	c.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, err := c.ReadMessage()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	typ, _ := m["type"].(string)
	return typ, m
}

// waitFor lee mensajes hasta encontrar el tipo buscado (descarta pings/otros).
func waitFor(t *testing.T, c *websocket.Conn, want string) map[string]any {
	t.Helper()
	for i := 0; i < 8; i++ {
		typ, m := recv(t, c)
		if typ == want {
			return m
		}
	}
	t.Fatalf("no llegó mensaje %q", want)
	return nil
}

func newServer(t *testing.T) *httptest.Server {
	t.Helper()
	h := NewHub()
	srv := httptest.NewServer(http.HandlerFunc(h.ServeWS))
	t.Cleanup(srv.Close)
	return srv
}

func TestCreateAndJoinFlow(t *testing.T) {
	srv := newServer(t)
	host := dial(t, srv)
	defer host.Close()

	send(t, host, map[string]any{"type": "create_room", "playerName": "Fiamy", "character": map[string]any{"name": "Fiamy"}})
	created := waitFor(t, host, "room_created")
	code, _ := created["roomCode"].(string)
	hostID, _ := created["playerId"].(string)
	if len(code) != 6 || hostID == "" {
		t.Fatalf("room_created inválido: %+v", created)
	}

	guest := dial(t, srv)
	defer guest.Close()
	send(t, guest, map[string]any{"type": "join_room", "roomCode": code, "playerName": "Beto", "character": map[string]any{"name": "Beto"}})

	joined := waitFor(t, guest, "room_joined")
	guestID, _ := joined["playerId"].(string)
	if guestID == "" || guestID == hostID {
		t.Fatalf("guest playerId inválido: %+v", joined)
	}
	players, _ := joined["players"].([]any)
	if len(players) != 2 {
		t.Fatalf("esperaba 2 jugadores, hay %d", len(players))
	}

	// El host debe enterarse de que entró alguien.
	pj := waitFor(t, host, "player_joined")
	if pj["player"] == nil {
		t.Fatalf("player_joined sin player: %+v", pj)
	}
}

func TestStartStoryAndTurnRelay(t *testing.T) {
	srv := newServer(t)
	host := dial(t, srv)
	defer host.Close()
	send(t, host, map[string]any{"type": "create_room", "playerName": "Host", "character": map[string]any{}})
	created := waitFor(t, host, "room_created")
	code := created["roomCode"].(string)
	hostID := created["playerId"].(string)

	guest := dial(t, srv)
	defer guest.Close()
	send(t, guest, map[string]any{"type": "join_room", "roomCode": code, "playerName": "Guest", "character": map[string]any{}})
	joined := waitFor(t, guest, "room_joined")
	guestID := joined["playerId"].(string)
	waitFor(t, host, "player_joined")

	// El host arranca la historia; el primero en jugar es él.
	send(t, host, map[string]any{"type": "start_story", "roomCode": code, "state": map[string]any{"turn": 0}, "activePlayerId": hostID})

	hs := waitFor(t, host, "story_started")
	if hs["yourTurn"] != true {
		t.Fatalf("host debería tener el turno: %+v", hs)
	}
	gs := waitFor(t, guest, "story_started")
	if gs["yourTurn"] != false {
		t.Fatalf("guest NO debería tener el turno: %+v", gs)
	}

	// El invitado intenta jugar fuera de turno → error not_your_turn.
	send(t, guest, map[string]any{"type": "submit_action", "roomCode": code, "action": "investigar", "stat": "mind", "usePet": false})
	errMsg := waitFor(t, guest, "error")
	if errMsg["code"] != ErrNotYourTurn {
		t.Fatalf("esperaba not_your_turn, llegó %+v", errMsg)
	}

	// El host resuelve su turno y difunde: ahora le toca al invitado.
	send(t, host, map[string]any{"type": "broadcast_game", "roomCode": code, "state": map[string]any{"turn": 1}, "activePlayerId": guestID, "eventSummary": "El host actuó."})
	su := waitFor(t, guest, "state_update")
	if su["yourTurn"] != true {
		t.Fatalf("guest debería tener el turno tras el broadcast: %+v", su)
	}

	// Ahora sí, el invitado manda su acción y le llega al host como guest_action.
	// usePet y useTalent son decisiones DEL INVITADO sobre SU personaje: si no
	// viajan, el host resuelve el turno con sus propios toggles (bug 2026-07-24).
	send(t, guest, map[string]any{"type": "submit_action", "roomCode": code, "action": "forzar la puerta", "stat": "body", "usePet": true, "useTalent": true})
	ga := waitFor(t, host, "guest_action")
	if ga["playerId"] != guestID || ga["action"] != "forzar la puerta" || ga["stat"] != "body" || ga["usePet"] != true {
		t.Fatalf("guest_action mal relayado: %+v", ga)
	}
	if ga["useTalent"] != true {
		t.Fatalf("useTalent del invitado no llegó al host: %+v", ga)
	}
}

func TestJoinErrors(t *testing.T) {
	srv := newServer(t)
	c := dial(t, srv)
	defer c.Close()

	// Código inexistente.
	send(t, c, map[string]any{"type": "join_room", "roomCode": "ZZZZZZ", "playerName": "X", "character": map[string]any{}})
	e := waitFor(t, c, "error")
	if e["code"] != ErrRoomNotFound {
		t.Fatalf("esperaba room_not_found: %+v", e)
	}
}

func TestInvalidStatRejected(t *testing.T) {
	srv := newServer(t)
	host := dial(t, srv)
	defer host.Close()
	send(t, host, map[string]any{"type": "create_room", "playerName": "H", "character": map[string]any{}})
	created := waitFor(t, host, "room_created")
	code := created["roomCode"].(string)
	hostID := created["playerId"].(string)
	send(t, host, map[string]any{"type": "start_story", "roomCode": code, "state": map[string]any{}, "activePlayerId": hostID})
	waitFor(t, host, "story_started")

	send(t, host, map[string]any{"type": "submit_action", "roomCode": code, "action": "x", "stat": "telepatia", "usePet": false})
	e := waitFor(t, host, "error")
	if e["code"] != ErrInvalidAction {
		t.Fatalf("esperaba invalid_action por stat inválido: %+v", e)
	}
}

func TestMidGameJoinNeedsOpenDoor(t *testing.T) {
	srv := newServer(t)
	host := dial(t, srv)
	defer host.Close()
	send(t, host, map[string]any{"type": "create_room", "playerName": "H", "character": map[string]any{}})
	created := waitFor(t, host, "room_created")
	code := created["roomCode"].(string)
	hostID := created["playerId"].(string)
	send(t, host, map[string]any{"type": "start_story", "roomCode": code, "state": map[string]any{"turn": 3}, "activePlayerId": hostID})
	waitFor(t, host, "story_started")

	// Puerta cerrada (default): el tardío rebota con story_started.
	late := dial(t, srv)
	defer late.Close()
	send(t, late, map[string]any{"type": "join_room", "roomCode": code, "playerName": "Tarde", "character": map[string]any{}})
	e := waitFor(t, late, "error")
	if e["code"] != ErrStoryStarted {
		t.Fatalf("esperaba story_started con puerta cerrada: %+v", e)
	}

	// El host abre la puerta → el tardío entra y recibe el estado vigente.
	send(t, host, map[string]any{"type": "set_room_options", "roomCode": code, "allowMidJoin": true})
	waitFor(t, host, "room_options")
	late2 := dial(t, srv)
	defer late2.Close()
	send(t, late2, map[string]any{"type": "join_room", "roomCode": code, "playerName": "Tarde2", "character": map[string]any{}})
	waitFor(t, late2, "room_joined")
	su := waitFor(t, late2, "state_update")
	if su["yourTurn"] != false {
		t.Fatalf("el tardío no debería tener el turno: %+v", su)
	}
}

func TestRoomCapsAtHostPlusFour(t *testing.T) {
	srv := newServer(t)
	host := dial(t, srv)
	defer host.Close()
	send(t, host, map[string]any{"type": "create_room", "playerName": "H", "character": map[string]any{}})
	created := waitFor(t, host, "room_created")
	code := created["roomCode"].(string)

	// 4 amigos entran bien; el 5.º rebota con room_full.
	for i := 0; i < 4; i++ {
		g := dial(t, srv)
		defer g.Close()
		send(t, g, map[string]any{"type": "join_room", "roomCode": code, "playerName": "G", "character": map[string]any{}})
		waitFor(t, g, "room_joined")
	}
	extra := dial(t, srv)
	defer extra.Close()
	send(t, extra, map[string]any{"type": "join_room", "roomCode": code, "playerName": "X", "character": map[string]any{}})
	e := waitFor(t, extra, "error")
	if e["code"] != ErrRoomFull {
		t.Fatalf("esperaba room_full para el 5.º invitado: %+v", e)
	}
}

func TestGuestCannotStartStory(t *testing.T) {
	srv := newServer(t)
	host := dial(t, srv)
	defer host.Close()
	send(t, host, map[string]any{"type": "create_room", "playerName": "H", "character": map[string]any{}})
	created := waitFor(t, host, "room_created")
	code := created["roomCode"].(string)

	guest := dial(t, srv)
	defer guest.Close()
	send(t, guest, map[string]any{"type": "join_room", "roomCode": code, "playerName": "G", "character": map[string]any{}})
	waitFor(t, guest, "room_joined")

	send(t, guest, map[string]any{"type": "start_story", "roomCode": code, "state": map[string]any{}, "activePlayerId": "whatever"})
	e := waitFor(t, guest, "error")
	if e["code"] != ErrNotHost {
		t.Fatalf("esperaba not_host: %+v", e)
	}
}

func TestSharedChatColorAndHostKick(t *testing.T) {
	srv := newServer(t)
	host := dial(t, srv)
	defer host.Close()
	send(t, host, map[string]any{"type": "create_room", "playerName": "Host", "character": map[string]any{}})
	created := waitFor(t, host, SRoomCreated)
	code := created["roomCode"].(string)
	guest := dial(t, srv)
	defer guest.Close()
	send(t, guest, map[string]any{"type": "join_room", "roomCode": code, "playerName": "Luna", "character": map[string]any{}})
	joined := waitFor(t, guest, SRoomJoined)
	guestID := joined["playerId"].(string)
	waitFor(t, host, SPlayerJoined)

	send(t, guest, map[string]any{"type": CSetChatColor, "roomCode": code, "color": "#ff66aa"})
	waitFor(t, guest, SPlayerUpdated)
	waitFor(t, host, SPlayerUpdated)
	send(t, host, map[string]any{"type": CSetChatColor, "roomCode": code, "color": "#ff66aa"})
	if waitFor(t, host, SError)["code"] != ErrInvalidAction {
		t.Fatal("dos integrantes no deben compartir color")
	}
	send(t, guest, map[string]any{"type": CSetChatColor, "roomCode": code, "color": "#111111"})
	if waitFor(t, guest, SError)["code"] != ErrInvalidAction {
		t.Fatal("un color sin contraste debe rechazarse")
	}
	send(t, guest, map[string]any{"type": CSetPlayerAvatar, "roomCode": code, "character": map[string]any{"name": "Luna", "avatarUrl": "/luna-cuerpo.jpg", "look": map[string]any{"avatarShot": "fullbody"}}})
	for _, client := range []*websocket.Conn{host, guest} {
		updated := waitFor(t, client, SPlayerUpdated)
		players := updated["players"].([]any)
		found := false
		for _, raw := range players {
			entry := raw.(map[string]any)
			if entry["id"] == guestID && entry["character"].(map[string]any)["avatarUrl"] == "/luna-cuerpo.jpg" {
				found = true
			}
		}
		if !found {
			t.Fatal("el avatar canónico no se sincronizó")
		}
	}
	send(t, guest, map[string]any{"type": CSendChat, "roomCode": code, "text": "Hola party"})
	chatHost := waitFor(t, host, SChatMessage)
	chatGuest := waitFor(t, guest, SChatMessage)
	for _, got := range []map[string]any{chatHost, chatGuest} {
		message := got["message"].(map[string]any)
		if message["text"] != "Hola party" || message["color"] != "#ff66aa" {
			t.Fatalf("chat inválido: %+v", got)
		}
	}

	send(t, guest, map[string]any{"type": CKickPlayer, "roomCode": code, "playerId": created["playerId"]})
	if waitFor(t, guest, SError)["code"] != ErrNotHost {
		t.Fatal("un invitado no debería poder expulsar")
	}
	send(t, host, map[string]any{"type": CKickPlayer, "roomCode": code, "playerId": guestID})
	if waitFor(t, guest, SPlayerKicked)["playerId"] != guestID {
		t.Fatal("el invitado no recibió la expulsión")
	}
}
