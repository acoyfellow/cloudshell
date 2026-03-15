export function html(username: string, token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>cloudshell</title>
  <link rel="stylesheet" href="https://unpkg.com/xterm@5.3.0/css/xterm.css" />
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
    #main { display: flex; height: calc(100% - 28px); }
    #terminal { flex: 1; }
    #filePanel {
      width: 250px;
      background: #1a1a1a;
      border-left: 1px solid #333;
      display: none;
      flex-direction: column;
    }
    #filePanel.visible { display: flex; }
    #fileHeader {
      padding: 8px 12px;
      background: #222;
      border-bottom: 1px solid #333;
      font: 12px monospace;
      color: #888;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #fileList {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .fileItem {
      padding: 6px 8px;
      margin: 2px 0;
      background: #252525;
      border-radius: 3px;
      font: 11px monospace;
      color: #aaa;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .fileItem:hover { background: #333; }
    .fileName { flex: 1; overflow: hidden; text-overflow: ellipsis; }
    .fileSize { color: #666; font-size: 10px; margin-left: 8px; }
    #uploadZone {
      padding: 16px;
      margin: 8px;
      border: 2px dashed #444;
      border-radius: 4px;
      text-align: center;
      color: #666;
      font: 11px monospace;
      cursor: pointer;
    }
    #uploadZone.dragover { border-color: #4a4; background: #1a2a1a; }
    #uploadZone:hover { border-color: #555; }
    .xterm { height: 100%; padding: 4px; }
  </style>
</head>
<body>
  <div id="bar">
    <span class="user">${username}</span>
    <span>
      <button onclick="toggleFiles()" style="background:#333;border:1px solid #444;color:#888;cursor:pointer;padding:2px 8px;font-size:11px;border-radius:3px;margin-right:8px;">files</button>
      <span id="status" class="status disconnected">disconnected</span>
      <button onclick="logout()" style="margin-left:12px;background:#333;border:1px solid #444;color:#888;cursor:pointer;padding:2px 8px;font-size:11px;border-radius:3px;">logout</button>
    </span>
  </div>
  <div id="main">
    <div id="terminal"></div>
    <div id="filePanel">
      <div id="fileHeader">
        <span>Files</span>
        <button onclick="refreshFiles()" style="background:none;border:none;color:#666;cursor:pointer;font-size:14px;">↻</button>
      </div>
      <div id="uploadZone" onclick="document.getElementById('fileInput').click()">
        Drop files here or click to upload
        <input type="file" id="fileInput" style="display:none" multiple onchange="handleFileSelect(event)">
      </div>
      <div id="fileList"></div>
    </div>
  </div>

  <script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js"></script>
  <script src="https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
  <script>
    const USERNAME = ${JSON.stringify(username)};
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

    const TOKEN = ${JSON.stringify(token)};
    
    function logout() {
      window.location.href = '/login';
    }function connect() {
      if (ws && ws.readyState <= 1) return;
      setStatus("connecting");

      if (!TOKEN) {
        window.location.href = '/login';
        return;
      }

      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const url = proto + "//" + location.host + "/ws/terminal?token=" + encodeURIComponent(TOKEN);

      ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        reconnectDelay = 500;
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
          term.write(new Uint8Array(ev.data));
        }
      };

      ws.onclose = (event) => {
        ready = false;
        setStatus("disconnected");
        
        if (event.code === 4030) {
          console.log('Auth error, redirecting to login...');
          window.location.href = '/login';
          return;
        }
        
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
          connect();
        }, reconnectDelay);
      };
    }

    term.onData((data) => {
      if (ws && ws.readyState === 1 && ready) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    term.onResize(({ cols, rows }) => {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    window.addEventListener("resize", () => fit.fit());
    connect();

    let filesVisible = false;

    function toggleFiles() {
      filesVisible = !filesVisible;
      document.getElementById('filePanel').classList.toggle('visible', filesVisible);
      if (filesVisible) refreshFiles();
    }

    async function refreshFiles() {
      try {
        const res = await fetch('/api/files/list', { headers: { 'Authorization': 'Bearer ' + TOKEN } });
        const data = await res.json();
        const list = document.getElementById('fileList');
        list.innerHTML = '';
        if (data.files) {
          data.files.forEach(f => {
            const div = document.createElement('div');
            div.className = 'fileItem';
            div.innerHTML = '<span class="fileName">' + f.name + '</span><span class="fileSize">' + formatBytes(f.size) + '</span>';
            div.onclick = () => downloadFile(f.name);
            list.appendChild(div);
          });
        }
      } catch (e) {
        console.error('Failed to load files', e);
      }
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async function downloadFile(name) {
      window.open('/api/files/download/' + encodeURIComponent(name) + '?token=' + encodeURIComponent(TOKEN));
    }

    async function handleFileSelect(e) {
      const files = e.target.files;
      if (!files.length) return;
      for (const file of files) {
        await uploadFile(file);
      }
      refreshFiles();
    }

    async function uploadFile(file) {
      const form = new FormData();
      form.append('file', file);
      try {
        await fetch('/api/files/upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + TOKEN },
          body: form
        });
      } catch (e) {
        console.error('Upload failed', e);
      }
    }

    const uploadZone = document.getElementById('uploadZone');
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      if (e.dataTransfer.files) {
        for (const file of e.dataTransfer.files) uploadFile(file);
        setTimeout(refreshFiles, 500);
      }
    });
  </script>
</body>
</html>`;
}

export function loginHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CloudShell - Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      height: 100%; 
      background: #0a0a0a; 
      font-family: monospace;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-box {
      background: #1a1a1a;
      border: 1px solid #333;
      padding: 40px;
      border-radius: 4px;
      width: 320px;
    }
    h1 {
      color: #ccc;
      font-size: 18px;
      margin-bottom: 24px;
      text-align: center;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      color: #888;
      font-size: 12px;
      margin-bottom: 4px;
    }
    input {
      width: 100%;
      padding: 8px 12px;
      background: #0a0a0a;
      border: 1px solid #333;
      color: #ccc;
      font-family: monospace;
      font-size: 14px;
    }
    input:focus {
      outline: none;
      border-color: #555;
    }
    button {
      width: 100%;
      padding: 10px;
      background: #2a2a2a;
      border: 1px solid #333;
      color: #ccc;
      font-family: monospace;
      font-size: 14px;
      cursor: pointer;
      margin-top: 8px;
    }
    button:hover {
      background: #333;
    }
    .error {
      color: #a44;
      font-size: 12px;
      margin-top: 12px;
      text-align: center;
      display: none;
    }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>CloudShell Login</h1>
    <form id="loginForm">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" required autofocus />
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required />
      </div>
      <button type="submit">Login</button>
      <div id="error" class="error"></div>
    </form>
  </div>

  <script>
    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorDiv.style.display = 'none';

      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
          window.location.href = '/?token=' + encodeURIComponent(data.token);
        } else {
          errorDiv.textContent = data.error || 'Login failed';
          errorDiv.style.display = 'block';
        }
      } catch (err) {
        errorDiv.textContent = 'Network error';
        errorDiv.style.display = 'block';
      }
    });
  </script>
</body>
</html>`;
}
