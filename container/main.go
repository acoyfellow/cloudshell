package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type ResizeMessage struct {
	Type string `json:"type"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

type ReadyMessage struct {
	Type string `json:"type"`
}

type ExitMessage struct {
	Type string `json:"type"`
	Code int    `json:"code"`
}

type ErrorMessage struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-User")
	if username == "" {
		username = "default"
	}

	userHome := filepath.Join("/home/user", username)
	os.MkdirAll(userHome, 0755)

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	log.Println("WebSocket connection established")

	sessionName := fmt.Sprintf("shell-%s", username)

	cmd := exec.Command("tmux", "new-session", "-A", "-s", sessionName)
	cmd.Dir = userHome
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("HOME=%s", userHome),
		"TERM=xterm-256color",
	)

	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("Failed to start PTY: %v", err)
		sendJSON(ws, ErrorMessage{Type: "error", Message: err.Error()})
		return
	}
	defer ptmx.Close()

	sendJSON(ws, ReadyMessage{Type: "ready"})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		buf := make([]byte, 4096)
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			n, err := ptmx.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("PTY read error: %v", err)
				}
				return
			}

			if n > 0 {
				if err := ws.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
					log.Printf("WebSocket write error: %v", err)
					return
				}
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			msgType, data, err := ws.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("WebSocket read error: %v", err)
				}
				return
			}

			if msgType == websocket.TextMessage {
				var resizeMsg ResizeMessage
				if err := json.Unmarshal(data, &resizeMsg); err == nil && resizeMsg.Type == "resize" {
					if resizeMsg.Cols > 0 && resizeMsg.Rows > 0 {
						pty.Setsize(ptmx, &pty.Winsize{
							Cols: uint16(resizeMsg.Cols),
							Rows: uint16(resizeMsg.Rows),
						})
						log.Printf("Resized terminal to %dx%d", resizeMsg.Cols, resizeMsg.Rows)
					}
				}
			} else if msgType == websocket.BinaryMessage {
				if _, err := ptmx.Write(data); err != nil {
					log.Printf("PTY write error: %v", err)
					return
				}
			}
		}
	}()

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	go func() {
		cmd.Wait()
		cancel()
	}()

	<-done

	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}
	sendJSON(ws, ExitMessage{Type: "exit", Code: exitCode})

	log.Println("WebSocket connection closed")
}

func sendJSON(ws *websocket.Conn, msg interface{}) bool {
	data, err := json.Marshal(msg)
	if err != nil {
		return false
	}
	return ws.WriteMessage(websocket.TextMessage, data) == nil
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func main() {
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Upgrade") == "websocket" {
			handleWebSocket(w, r)
		} else {
			healthHandler(w, r)
		}
	})
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/ws/terminal", handleWebSocket)

	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	go func() {
		log.Printf("CloudShell terminal server listening on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stop
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Shutdown error: %v", err)
	}

	log.Println("Server stopped")
}
