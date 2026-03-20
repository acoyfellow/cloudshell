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
    body { display: flex; flex-direction: column; }
    #bar {
      height: 28px; background: #1a1a1a; color: #666;
      font: 12px/28px monospace; padding: 0 12px;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #222;
      user-select: none;
      flex-shrink: 0;
    }
    #bar .user { color: #888; }
    #bar .status { font-size: 11px; }
    #bar .status.connected { color: #4a4; }
    #bar .status.connecting { color: #aa4; }
    #bar .status.disconnected { color: #a44; }
    #workspace { flex: 1; display: flex; min-height: 0; }
    #sessionRail {
      width: 210px;
      background: #111;
      border-right: 1px solid #222;
      display: flex;
      flex-direction: column;
      min-height: 0;
      flex-shrink: 0;
    }
    #sessionHeader {
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      border-bottom: 1px solid #222;
      font: 11px monospace;
      color: #777;
      text-transform: lowercase;
    }
    #sessionList {
      flex: 1;
      overflow-y: auto;
      padding: 8px 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .sessionItem {
      background: #181818;
      border: 1px solid #262626;
      border-radius: 4px;
      padding: 8px;
      color: #888;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 38px;
    }
    .sessionItem.active {
      background: #202020;
      border-color: #3a3a3a;
      color: #ddd;
    }
    .sessionItem:hover { border-color: #3a3a3a; }
    .sessionName {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font: 11px monospace;
    }
    .sessionActions, .tabActions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .railButton, .actionButton, #newTab {
      background: #1a1a1a;
      border: 1px solid #333;
      color: #777;
      cursor: pointer;
      border-radius: 3px;
      font: 12px monospace;
    }
    .railButton {
      width: 22px;
      height: 22px;
      line-height: 20px;
      text-align: center;
    }
    .actionButton {
      width: 18px;
      height: 18px;
      line-height: 16px;
      text-align: center;
      font-size: 10px;
    }
    .railButton:hover, .actionButton:hover, #newTab:hover {
      background: #252525;
      color: #aaa;
      border-color: #444;
    }
    #content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    #tabs {
      height: 28px;
      background: #151515;
      border-bottom: 1px solid #222;
      display: flex;
      align-items: center;
      padding: 0 8px;
      flex-shrink: 0;
    }
    .tab {
      padding: 4px 10px;
      margin-right: 4px;
      background: #222;
      color: #888;
      font: 11px monospace;
      border-radius: 3px 3px 0 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tab.active { background: #333; color: #ccc; }
    .tab:hover { background: #2a2a2a; }
    .tabClose {
      color: #666;
      font-size: 12px;
      line-height: 1;
    }
    .tabClose:hover { color: #a44; }
    #newTab {
      padding: 2px 8px;
      margin-left: 4px;
    }
    #main {
      position: relative;
      flex: 1;
      min-height: 0;
    }
    #terminal { position: absolute; inset: 0; }
    #filePanel, #portPanel {
      position: absolute;
      top: 28px;
      right: 0;
      bottom: 0;
      width: 250px;
      background: #1a1a1a;
      border-left: 1px solid #333;
      display: none;
      flex-direction: column;
      z-index: 10;
    }
    #filePanel.visible, #portPanel.visible { display: flex; }
    #fileHeader, #portHeader {
      padding: 8px 12px;
      background: #222;
      border-bottom: 1px solid #333;
      font: 12px monospace;
      color: #888;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #fileList, #portList {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .fileItem, .portItem {
      padding: 6px 8px;
      margin: 2px 0;
      background: #252525;
      border-radius: 3px;
      font: 11px monospace;
      color: #aaa;
    }
    .fileItem {
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .fileItem:hover { background: #333; }
    .fileName { flex: 1; overflow: hidden; text-overflow: ellipsis; }
    .fileSize, .portUrl { color: #666; font-size: 10px; margin-left: 8px; }
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
    #portInput { display: flex; padding: 8px; gap: 4px; }
    #portInput input {
      flex: 1;
      background: #0a0a0a;
      border: 1px solid #333;
      color: #ccc;
      font: 11px monospace;
      padding: 4px;
    }
    #portInput button {
      background: #2a2a2a;
      border: 1px solid #333;
      color: #888;
      font: 11px monospace;
      padding: 4px 8px;
      cursor: pointer;
    }
    .portNumber { color: #4a4; }
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
  <div id="workspace">
    <aside id="sessionRail">
      <div id="sessionHeader">
        <span>sessions</span>
        <button class="railButton" onclick="createNewSession()">+</button>
      </div>
      <div id="sessionList"></div>
    </aside>
    <div id="content">
      <div id="tabs">
        <div id="tabList" style="display:flex;flex:1;min-width:0;"></div>
        <button id="newTab" onclick="createNewTab()">+</button>
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
        <div id="portPanel">
          <div id="portHeader">Port Forwarding</div>
          <div id="portInput">
            <input type="number" id="portNumber" placeholder="Port (1024-65535)" min="1024" max="65535">
            <button onclick="addPort()">Add</button>
          </div>
          <div id="portList"></div>
        </div>
      </div>
    </div>
  </div>

  <script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js"></script>
  <script src="https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
  <script>
    const TOKEN = ${JSON.stringify(token)};
    const SESSION_STORAGE_KEY = 'cloudshell:selected-session';
    const statusEl = document.getElementById('status');

    function setStatus(value) {
      statusEl.textContent = value;
      statusEl.className = 'status ' + value;
    }

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#ccc',
        cursor: '#ccc',
        selectionBackground: '#444',
      },
    });

    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(document.getElementById('terminal'));
    fit.fit();

    let ws = null;
    let ready = false;
    let reconnectTimer = null;
    let reconnectDelay = 500;
    let reconnectAfterClose = false;

    let sessions = [];
    let tabs = [];
    let currentSessionId = null;
    let currentTabId = null;

    let filesVisible = false;
    let portsVisible = false;
    let forwardedPorts = [];
    let recording = false;
    let terminalOutput = [];

    function getAuthHeaders(extraHeaders = {}) {
      return Object.assign({ Authorization: 'Bearer ' + TOKEN }, extraHeaders);
    }

    async function apiFetch(path, init = {}) {
      const headers = new Headers(init.headers || {});
      headers.set('Authorization', 'Bearer ' + TOKEN);
      const response = await fetch(path, Object.assign({}, init, { headers }));

      if (response.status === 401) {
        window.location.href = '/login';
        throw new Error('Authentication required');
      }

      return response;
    }

    function getSelectedSessionId() {
      try {
        return localStorage.getItem(SESSION_STORAGE_KEY);
      } catch {
        return null;
      }
    }

    function persistSelectedSessionId(sessionId) {
      if (!sessionId) return;

      try {
        localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      } catch {}
    }

    function getCurrentSession() {
      return sessions.find(function(session) { return session.id === currentSessionId; }) || null;
    }

    function getCurrentTab() {
      return tabs.find(function(tab) { return tab.id === currentTabId; }) || tabs[0] || null;
    }

    function replaceSession(updatedSession) {
      sessions = sessions.map(function(session) {
        return session.id === updatedSession.id ? updatedSession : session;
      });
    }

    function updateLocalSessionSelection(tabId) {
      sessions = sessions.map(function(session) {
        if (session.id !== currentSessionId) return session;
        return Object.assign({}, session, {
          lastActiveTabId: tabId,
          lastOpenedAt: Date.now(),
        });
      });
    }

    function renderSessions() {
      const list = document.getElementById('sessionList');
      list.innerHTML = '';

      sessions.forEach(function(session) {
        const item = document.createElement('div');
        item.className = 'sessionItem' + (session.id === currentSessionId ? ' active' : '');

        const name = document.createElement('span');
        name.className = 'sessionName';
        name.textContent = session.name;
        item.appendChild(name);

        const actions = document.createElement('div');
        actions.className = 'sessionActions';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'actionButton';
        renameBtn.textContent = 'e';
        renameBtn.onclick = function(event) {
          event.stopPropagation();
          renameSession(session.id);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'actionButton';
        deleteBtn.textContent = 'x';
        deleteBtn.onclick = function(event) {
          event.stopPropagation();
          closeSession(session.id);
        };

        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(actions);
        item.onclick = function() { switchSession(session.id); };
        list.appendChild(item);
      });
    }

    function renderTabs() {
      const list = document.getElementById('tabList');
      list.innerHTML = '';

      tabs.forEach(function(tab) {
        const item = document.createElement('div');
        item.className = 'tab' + (tab.id === currentTabId ? ' active' : '');

        const label = document.createElement('span');
        label.textContent = tab.name;
        item.appendChild(label);

        if (tabs.length > 1) {
          const closeBtn = document.createElement('span');
          closeBtn.className = 'tabClose';
          closeBtn.textContent = '×';
          closeBtn.onclick = function(event) {
            event.stopPropagation();
            closeTab(tab.id);
          };
          item.appendChild(closeBtn);
        }

        item.onclick = function() { switchTab(tab.id); };
        list.appendChild(item);
      });
    }

    async function loadSessions() {
      const response = await apiFetch('/api/sessions');
      if (!response.ok) {
        throw new Error('Failed to load sessions');
      }

      const data = await response.json();
      return Array.isArray(data.sessions) ? data.sessions : [];
    }

    async function loadTabs(sessionId) {
      const response = await apiFetch('/api/sessions/' + encodeURIComponent(sessionId) + '/tabs');
      if (!response.ok) {
        throw new Error('Failed to load tabs');
      }

      const data = await response.json();
      return Array.isArray(data.tabs) ? data.tabs : [];
    }

    async function createSession(name) {
      const body = name ? { name: name } : {};
      const response = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      return response.json();
    }

    async function patchSession(sessionId, payload) {
      const response = await apiFetch('/api/sessions/' + encodeURIComponent(sessionId), {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to update session');
      }

      const data = await response.json();
      return data.session;
    }

    async function deleteSessionRequest(sessionId) {
      const response = await apiFetch('/api/sessions/' + encodeURIComponent(sessionId), {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete session');
      }
    }

    async function checkpointSession(sessionId, keepalive) {
      if (!sessionId) return true;

      const response = await fetch(
        '/api/sessions/' + encodeURIComponent(sessionId) + '/checkpoint',
        {
          method: 'POST',
          headers: getAuthHeaders(),
          keepalive: Boolean(keepalive),
        }
      );

      if (response.status === 401) {
        window.location.href = '/login';
        return false;
      }

      return response.ok;
    }

    async function createTab(sessionId, name) {
      const body = name ? { name: name } : {};
      const response = await apiFetch('/api/sessions/' + encodeURIComponent(sessionId) + '/tabs', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Failed to create tab');
      }

      const data = await response.json();
      return data.tab;
    }

    async function deleteTabRequest(sessionId, tabId) {
      const response = await apiFetch(
        '/api/sessions/' + encodeURIComponent(sessionId) + '/tabs/' + encodeURIComponent(tabId),
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete tab');
      }

      return response.json();
    }

    async function loadPorts(sessionId) {
      const response = await apiFetch('/api/sessions/' + encodeURIComponent(sessionId) + '/ports');
      if (!response.ok) {
        throw new Error('Failed to load ports');
      }

      const data = await response.json();
      return Array.isArray(data.ports) ? data.ports : [];
    }

    async function addPortRequest(sessionId, port) {
      const response = await apiFetch('/api/sessions/' + encodeURIComponent(sessionId) + '/ports', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ port: port }),
      });

      if (!response.ok) {
        throw new Error('Failed to forward port');
      }

      return response.json();
    }

    async function initializeWorkspace() {
      sessions = await loadSessions();

      const storedSessionId = getSelectedSessionId();
      currentSessionId = sessions.some(function(session) { return session.id === storedSessionId; })
        ? storedSessionId
        : sessions[0].id;
      persistSelectedSessionId(currentSessionId);

      tabs = await loadTabs(currentSessionId);
      const currentSession = getCurrentSession();
      currentTabId =
        tabs.find(function(tab) { return tab.id === currentSession.lastActiveTabId; })
          ? currentSession.lastActiveTabId
          : tabs[0].id;

      renderSessions();
      renderTabs();
    }

    async function createNewSession() {
      const previousSessionId = currentSessionId;

      try {
        if (previousSessionId) {
          await checkpointSession(previousSessionId, false);
        }

        const data = await createSession();
        sessions = sessions.concat(data.session);
        tabs = [data.tab];
        currentSessionId = data.session.id;
        currentTabId = data.tab.id;
        persistSelectedSessionId(currentSessionId);
        renderSessions();
        renderTabs();
        forwardedPorts = [];
        reconnectTerminal();
      } catch (error) {
        console.error('Failed to create session', error);
        term.writeln('\\r\\n[failed to create session]');
      }
    }

    async function renameSession(sessionId) {
      const session = sessions.find(function(candidate) { return candidate.id === sessionId; });
      if (!session) return;

      const nextName = window.prompt('Rename session', session.name);
      if (!nextName) return;

      try {
        const updatedSession = await patchSession(sessionId, { name: nextName });
        replaceSession(updatedSession);
        renderSessions();
      } catch (error) {
        console.error('Failed to rename session', error);
      }
    }

    async function switchSession(sessionId) {
      if (!sessionId || sessionId === currentSessionId) {
        return;
      }

      const previousSessionId = currentSessionId;

      try {
        if (previousSessionId) {
          await checkpointSession(previousSessionId, false);
        }

        currentSessionId = sessionId;
        persistSelectedSessionId(currentSessionId);
        tabs = await loadTabs(sessionId);

        const session = getCurrentSession();
        currentTabId =
          tabs.find(function(tab) { return tab.id === session.lastActiveTabId; })
            ? session.lastActiveTabId
            : tabs[0].id;

        renderSessions();
        renderTabs();

        if (portsVisible) {
          await refreshPorts();
        } else {
          forwardedPorts = [];
        }

        reconnectTerminal();
      } catch (error) {
        console.error('Failed to switch session', error);
        term.writeln('\\r\\n[failed to switch session]');
      }
    }

    async function closeSession(sessionId) {
      const session = sessions.find(function(candidate) { return candidate.id === sessionId; });
      if (!session) return;

      if (!window.confirm('Delete session "' + session.name + '" and all of its tabs?')) {
        return;
      }

      const deletingActiveSession = sessionId === currentSessionId;

      try {
        await deleteSessionRequest(sessionId);
        sessions = sessions.filter(function(candidate) { return candidate.id !== sessionId; });

        if (sessions.length === 0) {
          const data = await createSession();
          sessions = [data.session];
          tabs = [data.tab];
          currentSessionId = data.session.id;
          currentTabId = data.tab.id;
        } else if (deletingActiveSession) {
          currentSessionId = sessions[0].id;
          tabs = await loadTabs(currentSessionId);
          currentTabId = getCurrentSession().lastActiveTabId;
        }

        persistSelectedSessionId(currentSessionId);
        renderSessions();
        renderTabs();

        if (portsVisible) {
          await refreshPorts();
        } else {
          forwardedPorts = [];
        }

        if (deletingActiveSession) {
          reconnectTerminal();
        }
      } catch (error) {
        console.error('Failed to delete session', error);
        term.writeln('\\r\\n[failed to delete session]');
      }
    }

    async function createNewTab() {
      if (!currentSessionId) return;

      try {
        const tab = await createTab(currentSessionId);
        tabs = tabs.concat(tab);
        currentTabId = tab.id;
        updateLocalSessionSelection(tab.id);
        renderSessions();
        renderTabs();
        reconnectTerminal();
      } catch (error) {
        console.error('Failed to create tab', error);
        term.writeln('\\r\\n[failed to create tab]');
      }
    }

    async function switchTab(tabId) {
      if (!tabId || tabId === currentTabId || !currentSessionId) {
        return;
      }

      currentTabId = tabId;
      updateLocalSessionSelection(tabId);
      renderSessions();
      renderTabs();
      reconnectTerminal();

      try {
        const updatedSession = await patchSession(currentSessionId, { lastActiveTabId: tabId });
        replaceSession(updatedSession);
        renderSessions();
      } catch (error) {
        console.error('Failed to persist active tab', error);
      }
    }

    async function closeTab(tabId) {
      if (!currentSessionId || tabs.length <= 1) return;

      const deletingActiveTab = tabId === currentTabId;

      try {
        const result = await deleteTabRequest(currentSessionId, tabId);
        tabs = tabs.filter(function(tab) { return tab.id !== tabId; });

        if (deletingActiveTab) {
          currentTabId = result.lastActiveTabId;
          updateLocalSessionSelection(currentTabId);
          reconnectTerminal();
        }

        renderSessions();
        renderTabs();
      } catch (error) {
        console.error('Failed to delete tab', error);
        term.writeln('\\r\\n[failed to delete tab]');
      }
    }

    function logout() {
      window.location.href = '/login';
    }

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function connect() {
      if (ws && ws.readyState <= 1) return;
      setStatus('connecting');

      if (!TOKEN) {
        window.location.href = '/login';
        return;
      }

      if (!currentSessionId || !currentTabId) {
        return;
      }

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url =
        proto +
        '//' +
        location.host +
        '/ws/terminal?token=' +
        encodeURIComponent(TOKEN) +
        '&sessionId=' +
        encodeURIComponent(currentSessionId) +
        '&tabId=' +
        encodeURIComponent(currentTabId);

      const socket = new WebSocket(url);
      ws = socket;
      socket.binaryType = 'arraybuffer';

      socket.onopen = function() {
        if (ws !== socket) return;
        reconnectDelay = 500;
        socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };

      socket.onmessage = function(event) {
        if (ws !== socket) return;

        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'ready') {
              ready = true;
              setStatus('connected');
            } else if (message.type === 'exit') {
              term.writeln('\\r\\n[shell exited: code ' + message.code + ']');
              setStatus('disconnected');
            } else if (message.type === 'error') {
              term.writeln('\\r\\n[error: ' + message.message + ']');
            }
          } catch {}
        } else {
          term.write(new Uint8Array(event.data));
        }
      };

      socket.onclose = function(event) {
        const shouldReconnectImmediately = reconnectAfterClose;
        const wasReady = ready;

        if (ws === socket) {
          ws = null;
        }

        reconnectAfterClose = false;
        ready = false;
        setStatus('disconnected');

        if (event.code === 4030) {
          window.location.href = '/login';
          return;
        }

        if (!shouldReconnectImmediately && wasReady && currentSessionId) {
          checkpointSession(currentSessionId, false).catch(function(error) {
            console.error('Failed to checkpoint disconnected session', error);
          });
        }

        if (shouldReconnectImmediately) {
          connect();
          return;
        }

        if (reconnectTimer) return;
        reconnectTimer = setTimeout(function() {
          reconnectTimer = null;
          reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
          connect();
        }, reconnectDelay);
      };
    }

    function reconnectTerminal() {
      clearReconnectTimer();
      ready = false;
      term.reset();
      fit.fit();

      if (ws && ws.readyState <= 1) {
        reconnectAfterClose = true;
        const socket = ws;
        ws = null;
        socket.close(1000, 'context-change');
        return;
      }

      connect();
    }

    term.onData(function(data) {
      if (ws && ws.readyState === 1 && ready) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    term.onResize(function(size) {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
      }
    });

    window.addEventListener('resize', function() {
      fit.fit();

      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });

    window.addEventListener('beforeunload', function() {
      if (currentSessionId) {
        checkpointSession(currentSessionId, true).catch(function() {});
      }
    });

    function toggleFiles() {
      filesVisible = !filesVisible;
      document.getElementById('filePanel').classList.toggle('visible', filesVisible);
      if (filesVisible) refreshFiles();
    }

    async function refreshFiles() {
      try {
        const response = await apiFetch('/api/files/list');
        const data = await response.json();
        const list = document.getElementById('fileList');
        list.innerHTML = '';

        if (data.files) {
          data.files.forEach(function(file) {
            const item = document.createElement('div');
            item.className = 'fileItem';
            item.innerHTML =
              '<span class="fileName">' +
              file.name +
              '</span><span class="fileSize">' +
              formatBytes(file.size) +
              '</span>';
            item.onclick = function() { downloadFile(file.name); };
            list.appendChild(item);
          });
        }
      } catch (error) {
        console.error('Failed to load files', error);
      }
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const unit = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const index = Math.floor(Math.log(bytes) / Math.log(unit));
      return parseFloat((bytes / Math.pow(unit, index)).toFixed(1)) + ' ' + sizes[index];
    }

    async function downloadFile(name) {
      window.open('/api/files/download/' + encodeURIComponent(name) + '?token=' + encodeURIComponent(TOKEN));
    }

    async function handleFileSelect(event) {
      const selectedFiles = event.target.files;
      if (!selectedFiles.length) return;
      for (const file of selectedFiles) {
        await uploadFile(file);
      }
      refreshFiles();
    }

    async function uploadFile(file) {
      const form = new FormData();
      form.append('file', file);

      try {
        await apiFetch('/api/files/upload', {
          method: 'POST',
          body: form,
        });
      } catch (error) {
        console.error('Upload failed', error);
      }
    }

    function togglePorts() {
      portsVisible = !portsVisible;
      document.getElementById('portPanel').classList.toggle('visible', portsVisible);
      if (portsVisible) refreshPorts();
    }

    async function refreshPorts() {
      if (!currentSessionId) {
        forwardedPorts = [];
        renderPorts();
        return;
      }

      try {
        forwardedPorts = await loadPorts(currentSessionId);
        renderPorts();
      } catch (error) {
        console.error('Failed to load ports', error);
      }
    }

    async function addPort() {
      if (!currentSessionId) return;

      const input = document.getElementById('portNumber');
      const port = parseInt(input.value, 10);
      if (!port || port < 1024 || port > 65535) return;

      try {
        const forward = await addPortRequest(currentSessionId, port);
        forwardedPorts = forwardedPorts.concat(forward);
        renderPorts();
        input.value = '';
      } catch (error) {
        console.error('Failed to forward port', error);
      }
    }

    function renderPorts() {
      const list = document.getElementById('portList');
      list.innerHTML = '';

      forwardedPorts.forEach(function(port) {
        const item = document.createElement('div');
        item.className = 'portItem';
        item.innerHTML =
          '<span class="portNumber">:' +
          port.port +
          '</span><div class="portUrl">' +
          port.url +
          '</div>';
        list.appendChild(item);
      });
    }

    async function toggleRecord() {
      const button = document.getElementById('recordBtn');
      if (!recording) {
        recording = true;
        terminalOutput = [];
        button.style.color = '#a44';
        button.textContent = 'stop';
        term.onData(function(data) {
          if (recording) terminalOutput.push(data);
        });
      } else {
        recording = false;
        button.style.color = '#888';
        button.textContent = 'record';
        const blob = new Blob([terminalOutput.join('')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'recording-' + Date.now() + '.txt';
        link.click();
        URL.revokeObjectURL(url);
      }
    }

    const uploadZone = document.getElementById('uploadZone');
    uploadZone.addEventListener('dragover', function(event) {
      event.preventDefault();
      uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', function() {
      uploadZone.classList.remove('dragover');
    });
    uploadZone.addEventListener('drop', function(event) {
      event.preventDefault();
      uploadZone.classList.remove('dragover');
      if (event.dataTransfer.files) {
        for (const file of event.dataTransfer.files) {
          uploadFile(file);
        }
        setTimeout(refreshFiles, 500);
      }
    });

    initializeWorkspace()
      .then(function() { connect(); })
      .catch(function(error) {
        console.error('Failed to initialize workspace', error);
        term.writeln('\\r\\n[failed to initialize workspace]');
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
