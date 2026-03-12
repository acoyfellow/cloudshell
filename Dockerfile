# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS build

WORKDIR /app

# Install dependencies for PTY support
RUN apk add --no-cache git

# Create go.mod
RUN go mod init cloudshell

# Get WebSocket and PTY libraries
RUN go get github.com/gorilla/websocket github.com/creack/pty

# Create the shell server with WebSocket and PTY support
RUN cat > main.go << 'GOEOF'
package main

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
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
	// Upgrade HTTP to WebSocket
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	log.Println("WebSocket connection established")

	// Start bash with PTY
	cmd := exec.Command("/bin/bash")
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"PS1=\\w\\$ ",
	)

	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("Failed to start PTY: %v", err)
		sendJSON(ws, ErrorMessage{Type: "error", Message: err.Error()})
		return
	}
	defer ptmx.Close()

	// Send ready message
	sendJSON(ws, ReadyMessage{Type: "ready"})

	// Context for goroutine management
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var wg sync.WaitGroup

	// Goroutine 1: Read from PTY and send to WebSocket
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

	// Goroutine 2: Read from WebSocket and write to PTY
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
				// Handle JSON control messages (resize)
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
				// Write terminal input to PTY
				if _, err := ptmx.Write(data); err != nil {
					log.Printf("PTY write error: %v", err)
					return
				}
			}
		}
	}()

	// Wait for command to exit or context cancellation
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	// Also monitor process exit
	go func() {
		cmd.Wait()
		cancel()
	}()

	<-done

	// Send exit message
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
	// Listen for signals
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	// Router
	// Router - handle WebSocket upgrade on all paths for flexibility
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Check if this is a WebSocket upgrade request
		if r.Header.Get("Upgrade") == "websocket" {
			handleWebSocket(w, r)
		} else {
			healthHandler(w, r)
		}
	})
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/ws/terminal", handleWebSocket)

	// Server
	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	// Start server
	go func() {
		log.Printf("CloudShell terminal server listening on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for shutdown signal
	<-stop
	log.Println("Shutting down server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Shutdown error: %v", err)
	}

	log.Println("Server stopped")
}
GOEOF

# Build the server
RUN go mod tidy && go build -o /server

# Runtime image
FROM alpine:latest
RUN apk add --no-cache bash

# Create user for persistent home directory
RUN adduser -D -s /bin/bash user

COPY --from=build /server /server
EXPOSE 8080

# Start bash in user's home by default
WORKDIR /home/user
ENV HOME=/home/user

CMD ["/server"]
