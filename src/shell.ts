export function html(
  email: string,
  sandboxId: string,
  sessionId: string,
  nonce: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>cloudshell</title>
  <link rel="stylesheet" href="https://unpkg.com/xterm@5.3.0/css/xterm.css" />
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; background: #0a0a0a; overflow: hidden; }
    #bar {
      height: 28px; background: #1a1a1a; color: #666;
      font: 12px/28px monospace; padding: 0 12px;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #222;
      user-select: none;
    }
    #bar .user { color: #888; }
    #bar .status { font-size: 11px; }
    #bar .status.connected { color: #4a4; }
    #bar .status.connecting { color: #aa4; }
    #bar .status.disconnected { color: #a44; }
    #terminal { height: calc(100% - 28px); }
    .xterm { height: 100%; padding: 4px; }
    #timeout-warning {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #aa4;
      color: #000;
      padding: 20px;
      border-radius: 4px;
      font-family: monospace;
      display: none;
      z-index: 1000;
    }
  </style>
</head>
<body>
  <div id="bar">
    <span class="user">${email} &mdash; ${sandboxId}</span>
    <span id="status" class="status disconnected">disconnected</span>
  </div>
  <div id="terminal"></div>
  <div id="timeout-warning">
    Warning: Session will timeout in 5 minutes due to inactivity
  </div>

  <script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js"></script>
  <script src="https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
  <script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/addons/xterm-addon-fit/xterm-addon-fit.min.js" nonce="${nonce}"></script>
  <script nonce="${nonce}">
    const SANDBOX_ID = ${JSON.stringify(sandboxId)};
    const SESSION_ID = ${JSON.stringify(sessionId)};
    const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    const WARNING_TIME = 5 * 60 * 1000; // 5 minutes before timeout
    const statusEl = document.getElementById("status");
    const timeoutWarning = document.getElementById("timeout-warning");
    let lastActivity = Date.now();

    function setStatus(s) {
      statusEl.textContent = s;
      statusEl.className = "status " + s;
    }

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#ccc",
        cursor: "#ccc",
        selectionBackground: "#444",
      },
    });

    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(document.getElementById("terminal"));
    fit.fit();

    let ws = null;
    let ready = false;
    let reconnectTimer = null;
    let reconnectDelay = 500;
    let activityTimer = null;

    // Track user activity
    function updateActivity() {
      lastActivity = Date.now();
      timeoutWarning.style.display = "none";
    }

    // Check for timeout warning
    function checkTimeout() {
      const inactive = Date.now() - lastActivity;
      if (inactive > IDLE_TIMEOUT - WARNING_TIME && inactive < IDLE_TIMEOUT) {
        timeoutWarning.style.display = "block";
      } else if (inactive >= IDLE_TIMEOUT) {
        term.writeln("\\r\\n[Session timed out due to inactivity]");
        ws.close();
        return;
      }
    }

    function connect() {
      if (ws && ws.readyState <= 1) return;
      setStatus("connecting");

      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const url = proto + "//" + location.host + "/ws/terminal?id=" + encodeURIComponent(SANDBOX_ID) + "&session=" + encodeURIComponent(SESSION_ID);

      ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        reconnectDelay = 500;
        // send initial size
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        // Start activity tracking
        activityTimer = setInterval(checkTimeout, 60000); // Check every minute
      };

      ws.onmessage = (ev) => {
        updateActivity();
        if (typeof ev.data === "string") {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "ready") {
              ready = true;
              setStatus("connected");
            } else if (msg.type === "exit") {
              term.writeln("\\r\\n[shell exited: code " + msg.code + "]");
              setStatus("disconnected");
            } else if (msg.type === "error") {
              term.writeln("\\r\\n[error: " + msg.message + "]");
            }
          } catch {}
        } else {
          // binary frame: terminal output
          term.write(new Uint8Array(ev.data));
        }
      };

      ws.onclose = () => {
        ready = false;
        setStatus("disconnected");
        if (activityTimer) {
          clearInterval(activityTimer);
          activityTimer = null;
        }
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    function scheduleReconnect() {
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
        connect();
      }, reconnectDelay);
    }

    // keystrokes -> binary
    term.onData((data) => {
      updateActivity();
      if (ws && ws.readyState === 1 && ready) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    // resize -> json control message
    term.onResize(({ cols, rows }) => {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    window.addEventListener("resize", () => fit.fit());
    connect();
  </script>
</body>
</html>`;
}
