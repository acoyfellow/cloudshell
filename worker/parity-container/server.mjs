/**
 * Minimal WebSocket server matching cloudflare/containers-demos/terminal/host/server.js shape:
 * `ws` package, path /terminal, port 8080. Used only for Worker ↔ container smoke tests.
 */
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8080);
const WS_PATH = '/terminal';

const wss = new WebSocketServer({ port: PORT, path: WS_PATH });

console.log(`parity-container: WebSocketServer ${WS_PATH} on ${PORT}`);

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      type: 'parity-ready',
      message: 'cloudflare containers-demos/terminal-style host',
    })
  );
  ws.on('message', (data) => {
    const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
    ws.send(`parity-echo: ${text}`);
  });
});
