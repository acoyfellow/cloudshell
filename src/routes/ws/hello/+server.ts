import type { RequestHandler } from './$types';

function handleHelloWebSocket(request: Request): Response {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('expected websocket', {
      status: 426,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }

  const websocketPair = new WebSocketPair();
  const [client, server] = Object.values(websocketPair) as [WebSocket, WebSocket];
  server.accept({ allowHalfOpen: true });
  server.addEventListener('message', (event) => {
    const text = typeof event.data === 'string' ? event.data : String(event.data);
    server.send(`echo: ${text}`);
  });
  server.send('hello from app host');
  return new Response(null, { status: 101, webSocket: client });
}

export const GET: RequestHandler = async ({ request }) => handleHelloWebSocket(request);
