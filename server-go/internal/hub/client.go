package hub

import (
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 70 * time.Second
	pingPeriod     = 50 * time.Second
	maxMessageSize = 1 << 20 // 1 MiB: el estado del juego viaja completo (GameRoom serializado)
)

// Client es una conexión WebSocket viva. No sabe de salas: el Hub decide todo.
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

func newClient(h *Hub, conn *websocket.Conn) *Client {
	return &Client{hub: h, conn: conn, send: make(chan []byte, 64)}
}

// enqueue encola un mensaje saliente; si el buffer está lleno el cliente se
// considera muerto (lector lento) y se corta la conexión.
func (c *Client) enqueue(msg []byte) {
	select {
	case c.send <- msg:
	default:
		c.conn.Close()
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.handleDisconnect(c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		c.hub.handleMessage(c, data)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
