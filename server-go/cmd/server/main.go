// Servidor de salas de Tiny Quest (relay host-autoritativo sobre WebSocket).
//
// El juego corre en el navegador (TypeScript). Este proceso solo coordina:
// crea salas con código dictable, reparte membresía, relaya las acciones de los
// invitados al host y difunde el estado que el host declara autoritativo.
//
//	go run ./cmd/server            # escucha en :8787
//	PORT=9000 go run ./cmd/server  # o el puerto que quieras
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/FiammaMuscari/tinyquest/server-go/internal/hub"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8787"
	}

	h := hub.NewHub()

	mux := http.NewServeMux()
	mux.HandleFunc("/", h.ServeWS)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	addr := ":" + port
	log.Printf("Tiny Quest sala-server escuchando en ws://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server: %v", err)
	}
}
