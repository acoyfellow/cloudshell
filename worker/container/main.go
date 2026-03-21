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
	"strings"
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

type SessionState struct {
	SessionName string            `json:"sessionName"`
	Scrollback  []string          `json:"scrollback"`
	Cwd         string            `json:"cwd"`
	Env         map[string]string `json:"env"`
}

type Recording struct {
	StartTime int64   `json:"startTime"`
	Events    []Event `json:"events"`
}

type Event struct {
	Timestamp int64  `json:"timestamp"`
	Data      string `json:"data"`
}

const defaultSessionID = "main"
const defaultTabID = "main"
const maxIDLength = 48

var activeRecordings = make(map[string]*Recording)

var runtimeContext = struct {
	sync.Mutex
	username  string
	sessionID string
}{}

func sanitizeID(value string, fallback string) string {
	if value == "" {
		return fallback
	}

	var builder strings.Builder
	builder.Grow(len(value))

	for _, r := range strings.ToLower(value) {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
		case r == '-' || r == '_':
			builder.WriteRune(r)
		}

		if builder.Len() >= maxIDLength {
			break
		}
	}

	sanitized := strings.Trim(builder.String(), "-_")
	if sanitized == "" {
		return fallback
	}

	return sanitized
}

func sessionIDFromRequest(r *http.Request) string {
	if sessionID := strings.TrimSpace(r.Header.Get("X-Session-Id")); sessionID != "" {
		return sanitizeID(sessionID, defaultSessionID)
	}

	if sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId")); sessionID != "" {
		return sanitizeID(sessionID, defaultSessionID)
	}

	return defaultSessionID
}

func tabIDFromRequest(r *http.Request) string {
	if tabID := strings.TrimSpace(r.Header.Get("X-Tab-Id")); tabID != "" {
		return sanitizeID(tabID, defaultTabID)
	}

	if tabID := strings.TrimSpace(r.URL.Query().Get("tabId")); tabID != "" {
		return sanitizeID(tabID, defaultTabID)
	}

	return defaultTabID
}

func userHomeDir(username string) string {
	return filepath.Join("/home/user", username)
}

func sessionRuntimeDir(username string, sessionID string) string {
	return filepath.Join(
		userHomeDir(username),
		".cloudshell",
		"sessions",
		sanitizeID(sessionID, defaultSessionID),
	)
}

func tabStatePath(username string, sessionID string, tabID string) string {
	return filepath.Join(
		sessionRuntimeDir(username, sessionID),
		"tabs",
		fmt.Sprintf("%s.json", sanitizeID(tabID, defaultTabID)),
	)
}

func recordingStatePath(username string, sessionID string, tabID string) string {
	return filepath.Join(
		sessionRuntimeDir(username, sessionID),
		"recordings",
		fmt.Sprintf("%s.json", sanitizeID(tabID, defaultTabID)),
	)
}

func legacyTabStatePath(tabID string) string {
	return filepath.Join("/home/user", fmt.Sprintf(".session-%s.json", tmuxSessionName(tabID)))
}

func legacySingleSessionPath(username string) string {
	return filepath.Join("/home/user", fmt.Sprintf(".session-shell-%s.json", username))
}

func legacyRecordingPath(tabID string) string {
	return filepath.Join("/home/user", fmt.Sprintf(".recording-%s.json", tmuxSessionName(tabID)))
}

func tmuxSessionName(tabID string) string {
	return fmt.Sprintf("tab-%s", sanitizeID(tabID, defaultTabID))
}

func tabIDFromTmuxSession(sessionName string) string {
	if strings.HasPrefix(sessionName, "tab-") {
		trimmed := strings.TrimPrefix(sessionName, "tab-")
		if trimmed != "" {
			return sanitizeID(trimmed, defaultTabID)
		}
	}

	return sanitizeID(sessionName, defaultTabID)
}

func tmuxHasSession(sessionName string) bool {
	return exec.Command("tmux", "has-session", "-t", sessionName).Run() == nil
}

func tmuxDefaultCommands() [][]string {
	return [][]string{
		{"start-server"},
		{"set-option", "-g", "status", "off"},
	}
}

func applyTmuxDefaults() {
	for _, args := range tmuxDefaultCommands() {
		output, err := exec.Command("tmux", args...).CombinedOutput()
		if err == nil {
			continue
		}

		trimmed := strings.TrimSpace(string(output))
		if trimmed != "" {
			log.Printf("Failed to apply tmux defaults (%s): %v (%s)", strings.Join(args, " "), err, trimmed)
		} else {
			log.Printf("Failed to apply tmux defaults (%s): %v", strings.Join(args, " "), err)
		}
	}
}

func ensureSessionDirs(username string, sessionID string) error {
	sessionDir := sessionRuntimeDir(username, sessionID)
	return os.MkdirAll(filepath.Join(sessionDir, "tabs"), 0755)
}

func ensureRecordingDir(username string, sessionID string) error {
	return os.MkdirAll(filepath.Dir(recordingStatePath(username, sessionID, defaultTabID)), 0755)
}

func rememberRuntimeContext(username string, sessionID string) {
	runtimeContext.Lock()
	defer runtimeContext.Unlock()

	runtimeContext.username = username
	runtimeContext.sessionID = sessionID
}

func currentRuntimeContext() (string, string) {
	runtimeContext.Lock()
	defer runtimeContext.Unlock()

	return runtimeContext.username, runtimeContext.sessionID
}

func listTmuxSessions() []string {
	output, err := exec.Command("tmux", "list-sessions", "-F", "#{session_name}").CombinedOutput()
	if err != nil {
		trimmed := strings.TrimSpace(string(output))
		if trimmed == "" ||
			strings.Contains(trimmed, "no server running") ||
			strings.Contains(trimmed, "failed to connect to server") {
			return []string{}
		}

		log.Printf("Failed to list tmux sessions: %v (%s)", err, trimmed)
		return []string{}
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	sessions := make([]string, 0, len(lines))
	for _, line := range lines {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			sessions = append(sessions, trimmed)
		}
	}

	return sessions
}

func getTmuxScrollback(sessionName string) []string {
	cmd := exec.Command("tmux", "capture-pane", "-t", sessionName, "-p", "-S", "-1000")
	output, _ := cmd.Output()
	lines := strings.Split(string(output), "\n")
	return lines
}

func getTmuxCwd(sessionName string) string {
	cmd := exec.Command("tmux", "display-message", "-t", sessionName, "-p", "#{pane_current_path}")
	output, _ := cmd.Output()
	return strings.TrimSpace(string(output))
}

func saveTabState(username string, sessionID string, tabID string) bool {
	sessionName := tmuxSessionName(tabID)
	if !tmuxHasSession(sessionName) {
		return false
	}

	if err := ensureSessionDirs(username, sessionID); err != nil {
		log.Printf("Failed to create session dir for %s/%s: %v", username, sessionID, err)
		return false
	}

	state := SessionState{
		SessionName: sessionName,
		Scrollback:  getTmuxScrollback(sessionName),
		Cwd:         getTmuxCwd(sessionName),
		Env:         map[string]string{},
	}

	data, err := json.Marshal(state)
	if err != nil {
		return false
	}

	return os.WriteFile(tabStatePath(username, sessionID, tabID), data, 0644) == nil
}

func restoreTmuxSession(state SessionState) {
	applyTmuxDefaults()
	exec.Command("tmux", "new-session", "-Ad", "-s", state.SessionName).Run()
	if state.Cwd != "" {
		exec.Command("tmux", "send-keys", "-t", state.SessionName, fmt.Sprintf("cd %s", state.Cwd), "Enter").Run()
	}
}

func restoreTabState(username string, sessionID string, tabID string) bool {
	paths := []string{tabStatePath(username, sessionID, tabID)}

	if sessionID == defaultSessionID {
		paths = append(paths, legacyTabStatePath(tabID))
		if tabID == defaultTabID {
			paths = append(paths, legacySingleSessionPath(username))
		}
	}

	var data []byte
	var err error
	for _, path := range paths {
		data, err = os.ReadFile(path)
		if err == nil {
			break
		}
	}

	if err != nil {
		return false
	}

	var state SessionState
	if err := json.Unmarshal(data, &state); err != nil {
		return false
	}

	state.SessionName = tmuxSessionName(tabID)
	restoreTmuxSession(state)
	return true
}

func deleteTabState(username string, sessionID string, tabID string) bool {
	sessionName := tmuxSessionName(tabID)
	if tmuxHasSession(sessionName) {
		if err := exec.Command("tmux", "kill-session", "-t", sessionName).Run(); err != nil {
			log.Printf("Failed to kill tmux session %s: %v", sessionName, err)
		}
	}

	os.Remove(tabStatePath(username, sessionID, tabID))
	os.Remove(recordingStatePath(username, sessionID, tabID))

	if sessionID == defaultSessionID {
		os.Remove(legacyTabStatePath(tabID))
		os.Remove(legacyRecordingPath(tabID))
		if tabID == defaultTabID {
			os.Remove(legacySingleSessionPath(username))
		}
	}

	return true
}

func removeLegacySessionFiles(username string) {
	os.Remove(legacySingleSessionPath(username))

	if matches, err := filepath.Glob(filepath.Join("/home/user", ".session-tab-*.json")); err == nil {
		for _, match := range matches {
			os.Remove(match)
		}
	}

	if matches, err := filepath.Glob(filepath.Join("/home/user", ".recording-tab-*.json")); err == nil {
		for _, match := range matches {
			os.Remove(match)
		}
	}
}

func checkpointSession(username string, sessionID string) (int, error) {
	if err := ensureSessionDirs(username, sessionID); err != nil {
		return 0, err
	}

	count := 0
	for _, sessionName := range listTmuxSessions() {
		tabID := tabIDFromTmuxSession(sessionName)
		if saveTabState(username, sessionID, tabID) {
			count++
		}
	}

	return count, nil
}

func deleteSessionRuntime(username string, sessionID string) error {
	for _, sessionName := range listTmuxSessions() {
		if err := exec.Command("tmux", "kill-session", "-t", sessionName).Run(); err != nil {
			log.Printf("Failed to kill tmux session %s: %v", sessionName, err)
		}
	}

	if err := os.RemoveAll(sessionRuntimeDir(username, sessionID)); err != nil {
		return err
	}

	if sessionID == defaultSessionID {
		removeLegacySessionFiles(username)
	}

	return nil
}

func recordingKey(sessionID string, tabID string) string {
	return fmt.Sprintf("%s:%s", sanitizeID(sessionID, defaultSessionID), sanitizeID(tabID, defaultTabID))
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-User")
	if username == "" {
		username = "default"
	}

	sessionID := sessionIDFromRequest(r)
	tabID := tabIDFromRequest(r)
	rememberRuntimeContext(username, sessionID)

	userHome := userHomeDir(username)
	if err := os.MkdirAll(userHome, 0755); err != nil {
		http.Error(w, "failed to initialize user workspace", http.StatusInternalServerError)
		return
	}
	if err := ensureSessionDirs(username, sessionID); err != nil {
		http.Error(w, "failed to initialize session workspace", http.StatusInternalServerError)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	log.Printf("WebSocket connection established for %s/%s/%s", username, sessionID, tabID)

	sessionName := tmuxSessionName(tabID)
	applyTmuxDefaults()

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

			switch msgType {
			case websocket.TextMessage:
				var resizeMsg ResizeMessage
				if err := json.Unmarshal(data, &resizeMsg); err == nil && resizeMsg.Type == "resize" {
					if resizeMsg.Cols > 0 && resizeMsg.Rows > 0 {
						pty.Setsize(ptmx, &pty.Winsize{
							Cols: uint16(resizeMsg.Cols),
							Rows: uint16(resizeMsg.Rows),
						})
					}
				}
			case websocket.BinaryMessage:
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

	log.Printf("WebSocket connection closed for %s/%s/%s", username, sessionID, tabID)
}

func sendJSON(ws *websocket.Conn, msg interface{}) bool {
	data, err := json.Marshal(msg)
	if err != nil {
		return false
	}
	return ws.WriteMessage(websocket.TextMessage, data) == nil
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	health := map[string]interface{}{
		"status":     "ok",
		"fuse_mount": checkFuseMount(),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}

func checkFuseMount() bool {
	if _, err := os.Stat("/home/user/.ash_history"); err == nil {
		return true
	}

	file, err := os.CreateTemp("/home/user", "health_check_")
	if err != nil {
		return false
	}
	os.Remove(file.Name())
	return true
}

func saveTabHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	username := r.Header.Get("X-User")
	if username == "" {
		username = "default"
	}
	sessionID := sessionIDFromRequest(r)
	tabID := tabIDFromRequest(r)
	rememberRuntimeContext(username, sessionID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"saved": saveTabState(username, sessionID, tabID)})
}

func restoreTabHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	username := r.Header.Get("X-User")
	if username == "" {
		username = "default"
	}
	sessionID := sessionIDFromRequest(r)
	tabID := tabIDFromRequest(r)
	rememberRuntimeContext(username, sessionID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"restored": restoreTabState(username, sessionID, tabID)})
}

func deleteTabHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	username := r.Header.Get("X-User")
	if username == "" {
		username = "default"
	}
	sessionID := sessionIDFromRequest(r)
	tabID := tabIDFromRequest(r)
	rememberRuntimeContext(username, sessionID)

	deleteTabState(username, sessionID, tabID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"deleted": true})
}

func checkpointSessionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	username := r.Header.Get("X-User")
	if username == "" {
		username = "default"
	}
	sessionID := sessionIDFromRequest(r)
	rememberRuntimeContext(username, sessionID)

	count, err := checkpointSession(username, sessionID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]bool{"saved": false})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"saved": true, "tabs": count})
}

func deleteSessionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	username := r.Header.Get("X-User")
	if username == "" {
		username = "default"
	}
	sessionID := sessionIDFromRequest(r)
	rememberRuntimeContext(username, sessionID)

	if err := deleteSessionRuntime(username, sessionID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]bool{"deleted": false})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"deleted": true})
}

func startRecordingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	sessionID := sessionIDFromRequest(r)
	tabID := tabIDFromRequest(r)
	activeRecordings[recordingKey(sessionID, tabID)] = &Recording{
		StartTime: time.Now().Unix(),
		Events:    []Event{},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"recording": true})
}

func stopRecordingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	username := r.Header.Get("X-User")
	if username == "" {
		username = "default"
	}
	sessionID := sessionIDFromRequest(r)
	tabID := tabIDFromRequest(r)

	recording, exists := activeRecordings[recordingKey(sessionID, tabID)]
	if !exists {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"saved": false})
		return
	}

	if err := ensureRecordingDir(username, sessionID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]bool{"saved": false})
		return
	}

	data, _ := json.Marshal(recording)
	os.WriteFile(recordingStatePath(username, sessionID, tabID), data, 0644)
	delete(activeRecordings, recordingKey(sessionID, tabID))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"saved": true})
}

func getRecordingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	username := r.Header.Get("X-User")
	if username == "" {
		username = "default"
	}
	sessionID := sessionIDFromRequest(r)
	tabID := tabIDFromRequest(r)

	paths := []string{recordingStatePath(username, sessionID, tabID)}
	if sessionID == defaultSessionID {
		paths = append(paths, legacyRecordingPath(tabID))
	}

	var data []byte
	var err error
	for _, path := range paths {
		data, err = os.ReadFile(path)
		if err == nil {
			break
		}
	}

	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
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
	mux.HandleFunc("/api/tab/save", saveTabHandler)
	mux.HandleFunc("/api/tab/restore", restoreTabHandler)
	mux.HandleFunc("/api/tab/delete", deleteTabHandler)
	mux.HandleFunc("/api/session/checkpoint", checkpointSessionHandler)
	mux.HandleFunc("/api/session/delete", deleteSessionHandler)
	mux.HandleFunc("/api/recording/start", startRecordingHandler)
	mux.HandleFunc("/api/recording/stop", stopRecordingHandler)
	mux.HandleFunc("/api/recording/get", getRecordingHandler)

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

	if username, sessionID := currentRuntimeContext(); username != "" && sessionID != "" {
		if count, err := checkpointSession(username, sessionID); err != nil {
			log.Printf("Checkpoint on shutdown failed for %s/%s: %v", username, sessionID, err)
		} else {
			log.Printf("Checkpointed %d tabs on shutdown for %s/%s", count, username, sessionID)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Shutdown error: %v", err)
	}

	log.Println("Server stopped")
}
