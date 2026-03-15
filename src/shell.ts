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
    #tabs { height: 28px; background: #151515; border-bottom: 1px solid #222; display: flex; align-items: center; padding: 0 8px; }
    .tab { padding: 4px 12px; margin-right: 4px; background: #222; color: #888; font: 11px monospace; border-radius: 3px 3px 0 0; cursor: pointer; display: flex; align-items: center; }
    .tab.active { background: #333; color: #ccc; }
    .tab:hover { background: #2a2a2a; }
    .tab-close { margin-left: 8px; color: #666; font-size: 14px; line-height: 1; }
    .tab-close:hover { color: #a44; }
    #newTab { padding: 2px 8px; background: #1a1a1a; color: #666; font: 14px monospace; border: 1px solid #333; border-radius: 3px; cursor: pointer; }
    #newTab:hover { background: #252525; color: #888; }
    #main { position: relative; height: calc(100% - 56px); width: 100%; }
    #terminal { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
    #filePanel {
      position: absolute;
      top: 56px;
      right: 0;
      bottom: 0;
      width: 250px;
      background: #1a1a1a;
      border-left: 1px solid #333;
      display: none;
      flex-direction: column;
      z-index: 10;
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
    #portPanel { position: absolute; top: 56px; right: 0; bottom: 0; width: 250px; background: #1a1a1a; border-left: 1px solid #333; display: none; flex-direction: column; z-index: 10; }
    #portPanel.visible { display: flex; }
    #portHeader { padding: 8px 12px; background: #222; border-bottom: 1px solid #333; font: 12px monospace; color: #888; }
    #portInput { display: flex; padding: 8px; gap: 4px; }
    #portInput input { flex: 1; background: #0a0a0a; border: 1px solid #333; color: #ccc; font: 11px monospace; padding: 4px; }
    #portInput button { background: #2a2a2a; border: 1px solid #333; color: #888; font: 11px monospace; padding: 4px 8px; cursor: pointer; }
    #portList { flex: 1; overflow-y: auto; padding: 8px; }
    .portItem { padding: 6px 8px; margin: 2px 0; background: #252525; border-radius: 3px; font: 11px monospace; }
    .portNumber { color: #4a4; }
    .portUrl { color: #666; font-size: 10px; }
    .xterm { height: 100%; padding: 4px; }
  </style>
</head>
<body>
  <div id="bar">
    <span class="user">${username}</span>
    <span>
      <button onclick="toggleFiles()" style="background:#333;border:1px solid #444;color:#888;cursor:pointer;padding:2px 8px;font-size:11px;border-radius:3px;margin-right:8px;">files</button>
      <button onclick="togglePorts()" style="background:#333;border:1px solid #444;color:#888;cursor:pointer;padding:2px 8px;font-size:11px;border-radius:3px;margin-right:8px;">ports</button>
      <button onclick="toggleRecord()" id="recordBtn" style="background:#333;border:1px solid #444;color:#888;cursor:pointer;padding:2px 8px;font-size:11px;border-radius:3px;margin-right:8px;">record</button>
      <span id="status" class="status disconnected">disconnected</span>
      <button onclick="logout()" style="margin-left:12px;background:#333;border:1px solid #444;color:#888;cursor:pointer;padding:2px 8px;font-size:11px;border-radius:3px;">logout</button>
    </span>
  </div>
  <div id="tabs">
    <div id="tabList" style="display:flex;flex:1;"></div>
    <button id="newTab" onclick="createNewTab()">+</button>
  </div>
  <div id="main">
    <div id="terminal"></div>
  </div>
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
  <div id="portPanel">
    <div id="portHeader">Port Forwarding</div>
    <div id="portInput">
      <input type="number" id="portNumber" placeholder="Port (1024-65535)" min="1024" max="65535">
      <button onclick="addPort()">Add</button>
    </div>
    <div id="portList"></div>
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

    let tabs = [{id: 'tab-1', name: 'shell', active: true, session: 'main'}];
    let currentTab = 'tab-1';

    function renderTabs() {
      const list = document.getElementById('tabList');
      list.innerHTML = '';
      tabs.forEach(tab => {
        const div = document.createElement('div');
        div.className = 'tab' + (tab.active ? ' active' : '');
        const closeBtn = tabs.length > 1 ? '<span class="tab-close" onclick="event.stopPropagation();closeTab(' + "'" + tab.id + "'" + ')">×</span>' : '';
        div.innerHTML = '<span>' + tab.name + '</span>' + closeBtn;
        div.onclick = () => switchTab(tab.id);
        list.appendChild(div);
      });
    }

    function createNewTab() {
      const id = 'tab-' + Date.now();
      const name = 'shell-' + tabs.length;
      tabs.push({id, name, active: false, session: id});
      renderTabs();
      switchTab(id);
    }

    function switchTab(id) {
      tabs.forEach(t => t.active = (t.id === id));
      currentTab = id;
      renderTabs();
    }

    function closeTab(id) {
      if (tabs.length <= 1) return;
      const idx = tabs.findIndex(t => t.id === id);
      tabs = tabs.filter(t => t.id !== id);
      if (currentTab === id && tabs.length > 0) {
        switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
      } else {
        renderTabs();
      }
    }

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

    let portsVisible = false;
    let forwardedPorts = [];
    let recording = false;
    let terminalOutput = [];

    function togglePorts() {
      portsVisible = !portsVisible;
      document.getElementById('portPanel').classList.toggle('visible', portsVisible);
      if (portsVisible) renderPorts();
    }

    async function addPort() {
      const input = document.getElementById('portNumber');
      const port = parseInt(input.value);
      if (!port || port < 1024 || port > 65535) return;

      try {
        const res = await fetch('/api/ports/forward', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ port })
        });
        const data = await res.json();
        if (data.url) {
          forwardedPorts.push({ port, url: data.url });
          renderPorts();
          input.value = '';
        }
      } catch (e) {
        console.error('Failed to forward port', e);
      }
    }

    function renderPorts() {
      const list = document.getElementById('portList');
      list.innerHTML = '';
      forwardedPorts.forEach(p => {
        const div = document.createElement('div');
        div.className = 'portItem';
        div.innerHTML = '<span class="portNumber">:' + p.port + '</span><div class="portUrl">' + p.url + '</div>';
        list.appendChild(div);
      });
    }

    async function toggleRecord() {
      const btn = document.getElementById('recordBtn');
      if (!recording) {
        recording = true;
        terminalOutput = [];
        btn.style.color = '#a44';
        btn.textContent = 'stop';
        term.onData((data) => {
          if (recording) terminalOutput.push(data);
        });
      } else {
        recording = false;
        btn.style.color = '#888';
        btn.textContent = 'record';
        const blob = new Blob([terminalOutput.join('')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'recording-' + Date.now() + '.txt';
        a.click();
        URL.revokeObjectURL(url);
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

    renderTabs();
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
