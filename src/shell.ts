export function html(email: string, sandboxId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>cloudshell</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.css" />
  <style>
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
  </style>
</head>
<body>
  <div id="bar">
    <span class="user">${email} &mdash; ${sandboxId}</span>
    <span id="status" class="status disconnected">disconnected</span>
  </div>
  <div id="terminal"></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/addons/xterm-addon-fit/xterm-addon-fit.min.js"></script>
  <script>
    const SANDBOX_ID = ${JSON.stringify(sandboxId)};
    const statusEl = document.getElementById("status");

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

    function connect() {
      if (ws && ws.readyState <= 1) return;
      setStatus("connecting");

      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const url = proto + "//" + location.host + "/ws/terminal?id=" + encodeURIComponent(SANDBOX_ID);

      ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        reconnectDelay = 500;
        // send initial size
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (ev) => {
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
