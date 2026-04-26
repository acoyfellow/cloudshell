import { Hono } from 'hono';
import type { Context, ExecutionContext } from 'hono';
import { Container, getContainer } from '@cloudflare/containers';
import {
  backupWorkspace,
  checkpointSession,
  createLegacyTab,
  createSession,
  createTab,
  deleteLegacyTab,
  deleteSession,
  deleteTab,
  forwardLegacyPort,
  forwardPort,
  listLegacyPorts,
  listLegacyTabs,
  listPorts,
  listSessions,
  listTabs,
  requireAuthorizedUsername,
  updateTab,
  updateSession,
  prepareTerminalForWebSocketContext,
} from './effect/programs';
import { buildContainerWebSocketRequest } from './effect/services';
import {
  runJsonRoute,
  runRequestEffect,
  runRouteEffect,
  toErrorResponse,
  toRouteErrorResponse,
} from './effect/runtime';
import { UnexpectedFailure } from './effect/errors';
import { getUserSessionContainerId, readWorkerIdentity } from './auth';
import { isContainerActiveStatus } from './tabs';
import { startOAuth, completeOAuth, listConnections, disconnect } from './mcp-oauth';
import { bridgeMcpRequest } from './mcp-bridge';
import { InvalidMcpServerUrl } from './user-agent';
import { handleAiGatewayUpstreamProof20260426 } from './experiments/ai-gateway-upstream-proof-20260426';
import type { Env } from './types';

// Re-export the user-agent DO so alchemy can bind it as a Durable Object
// class. See worker/user-agent.ts for the shape + rationale. This export
// is a no-op for the terminal path; binding the namespace on the Worker
// is what makes user-scoped MCP OAuth storage possible in later steps.
export { CloudshellUserAgent } from './user-agent';

// Export the Container class for Durable Object binding
export {
  CloudShellTerminal,
  TerminalContainer,
  ShellContainer,
  CloudShellSandbox,
  CloudShellParityTerminal,
};

/** Minimal parity DO: cloudflare/containers-demos/terminal (Node `ws` on /terminal). */
class CloudShellParityTerminal extends Container {
  defaultPort = 8080;
  sleepAfter = '30m';
  enableInternet = true;

  override async fetch(request: Request): Promise<Response> {
    return await this.containerFetch(request, this.defaultPort);
  }
}

class CloudShellTerminal extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
  // Required post-GA (@cloudflare/containers >= 0.3.x) for tigrisfs to reach
  // R2 during startup and for npm/git used inside the shell. Parity class
  // already had this; the terminal class was missing it.
  enableInternet = true;

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = {
      AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: env.R2_BUCKET_NAME,
      R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
    };
  }

  // Post-Containers GA (2026-04-13): WS upgrades to a DO-backed container require
  // an explicit `containerFetch(request, port)` so the runtime knows which internal
  // port to proxy the Upgrade handshake to. The default `Container.fetch` does not
  // forward WS upgrades, which causes the browser to hang in CONNECTING (observed
  // as "Attaching terminal…" forever; close code 1006 once the edge gives up).
  // Mirrors the override on CloudShellParityTerminal, which has been our smoke test
  // for the working shape.
  override async fetch(request: Request): Promise<Response> {
    return await this.containerFetch(request, this.defaultPort);
  }
}

// Legacy classes for backwards compatibility with existing Durable Objects
class TerminalContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

class ShellContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

class CloudShellSandbox extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

function normalizeRelativeFilePath(input: string | undefined | null): string {
  const trimmed = (input ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) {
    return '';
  }

  const segments = trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..');

  return segments.join('/');
}

function fileStoragePrefix(userId: string): string {
  return `${userId}/`;
}

function buildFileStorageKey(userId: string, relativePath: string): string {
  const normalizedPath = normalizeRelativeFilePath(relativePath);
  return `${fileStoragePrefix(userId)}${normalizedPath}`;
}

async function verifyShellVisibleFile(
  env: Env,
  userId: string,
  sessionId: string | null,
  relativePath: string
): Promise<boolean | null> {
  const normalizedSessionId = sessionId?.trim();
  const normalizedPath = normalizeRelativeFilePath(relativePath);

  if (!normalizedSessionId || !normalizedPath) {
    return null;
  }

  try {
    const container = getContainer(env.Sandbox, getUserSessionContainerId(userId, normalizedSessionId));
    const state = await container.getState();
    if (!isContainerActiveStatus(state.status)) {
      return null;
    }

    await container.waitForPort({ portToCheck: 8080 });

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await container.fetch(
        new Request(
          `http://localhost:8080/api/files/stat?path=${encodeURIComponent(normalizedPath)}`,
          {
            method: 'GET',
            headers: {
              'X-User': userId,
              'X-Session-Id': normalizedSessionId,
            },
          }
        )
      );

      if (response.ok) {
        const payload = (await response.json()) as { exists?: boolean };
        if (payload.exists === true) {
          return true;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return false;
  } catch {
    return null;
  }
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  async function requireUserId(c: Context<{ Bindings: Env }>) {
    try {
      return await runRequestEffect(
        c.env,
        requireAuthorizedUsername({ userIdHeader: c.req.header('X-User-Id') })
      );
    } catch (error) {
      return toRouteErrorResponse(c, error);
    }
  }

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.post('/experiments/ai-gateway-upstream-proof-20260426', async (c) => {
    return handleAiGatewayUpstreamProof20260426(c.req.raw, c.env);
  });

  /**
   * MCP OAuth broker endpoints.
   *
   * The APP (SvelteKit) forwards authenticated requests here after
   * validating the Better Auth session and attaching X-User-Id. This
   * Worker does NOT validate the session itself; it trusts forwarded
   * identity the same way every other /api/* route does.
   *
   * Browser-facing surface (the popup, the authorize redirect) lives
   * on the APP origin. These routes are the server-side state machine
   * behind the APP's /api/mcp/oauth/{start,callback} endpoints.
   */
  app.post('/mcp/oauth/start', async (c) => {
    try {
      const userId = c.req.header('X-User-Id');
      if (!userId) return c.json({ error: 'X-User-Id required' }, 401);
      const body = await c.req.json<{ serverUrl?: string; redirectUrl?: string }>();
      if (!body.serverUrl || !body.redirectUrl) {
        return c.json({ error: 'serverUrl and redirectUrl are required' }, 400);
      }
      const result = await startOAuth(c.env, userId, {
        serverUrl: body.serverUrl,
        redirectUrl: body.redirectUrl,
      });
      return c.json(result);
    } catch (error) {
      // Bad user input (e.g. `mcp login cf-portal` \u2014 not a URL) surfaces as
      // InvalidMcpServerUrl from the DO. Return 400 with the specific
      // message so the CLI can print it cleanly instead of "500 Internal
      // server error".
      if (error instanceof InvalidMcpServerUrl) {
        return c.json({ error: error.message }, 400);
      }
      return toRouteErrorResponse(c, error);
    }
  });

  app.post('/mcp/oauth/callback', async (c) => {
    try {
      const userId = c.req.header('X-User-Id');
      if (!userId) return c.json({ error: 'X-User-Id required' }, 401);
      const body = await c.req.json<{
        state?: string;
        code?: string;
        redirectUrl?: string;
      }>();
      if (!body.state || !body.code || !body.redirectUrl) {
        return c.json(
          { error: 'state, code, and redirectUrl are required' },
          400
        );
      }
      const result = await completeOAuth(c.env, userId, {
        state: body.state,
        code: body.code,
        redirectUrl: body.redirectUrl,
      });
      return c.json(result);
    } catch (error) {
      return toRouteErrorResponse(c, error);
    }
  });

  /**
   * List the MCP servers the authenticated user has connected. The APP
   * forwards here after validating the bridge ticket (see
   * src/lib/server/mcp-bridge-auth.ts). Trusts X-User-Id; returns
   * only public metadata (serverId + connectedAt), never tokens.
   */
  app.get('/mcp/connections', async (c) => {
    try {
      const userId = c.req.header('X-User-Id');
      if (!userId) return c.json({ error: 'X-User-Id required' }, 401);
      const connections = await listConnections(c.env, userId);
      return c.json({ connections });
    } catch (error) {
      return toRouteErrorResponse(c, error);
    }
  });

  /**
   * Disconnect a stored MCP connection. Called by `mcp logout <url>`
   * and by the UI's "Disconnect" button. Clears tokens + client_info
   * + state + code_verifier for this (user, server) pair, and removes
   * the entry from the user's connection index. Idempotent.
   */
  app.delete('/mcp/connections', async (c) => {
    try {
      const userId = c.req.header('X-User-Id');
      if (!userId) return c.json({ error: 'X-User-Id required' }, 401);
      const serverUrl = c.req.query('server');
      if (!serverUrl) {
        return c.json({ error: 'server query param required' }, 400);
      }
      const result = await disconnect(c.env, userId, serverUrl);
      return c.json(result);
    } catch (error) {
      return toRouteErrorResponse(c, error);
    }
  });

  /**
   * Bridge proxy to an upstream MCP server. The CLI (inside the
   * container) sends the MCP JSON-RPC request here; we attach the
   * stored OAuth bearer and forward to the upstream. Streaming-HTTP
   * / SSE responses flow end-to-end without buffering.
   *
   * Query param `server` carries the upstream origin; the remainder
   * of the path (after /mcp/bridge) is the MCP server's path
   * ("mcp" or "sse" typically). Example:
   *   POST /mcp/bridge/mcp?server=https://mcp.apify.com
   *   ^ forwards to https://mcp.apify.com/mcp
   */
  app.all('/mcp/bridge/*', async (c) => {
    try {
      const userId = c.req.header('X-User-Id');
      if (!userId) return c.json({ error: 'X-User-Id required' }, 401);
      const serverUrl = c.req.query('server');
      if (!serverUrl) {
        return c.json({ error: 'server query param required' }, 400);
      }
      const baseRedirectUrl = c.req.header('X-Bridge-Redirect-Url');
      if (!baseRedirectUrl) {
        return c.json(
          { error: 'X-Bridge-Redirect-Url header required' },
          400
        );
      }

      const fullPath = new URL(c.req.url).pathname;
      const relativePath = fullPath.replace(/^\/mcp\/bridge/, '') || '/';

      return await bridgeMcpRequest(c.env, {
        userId,
        serverUrl,
        path: relativePath,
        request: c.req.raw,
        baseRedirectUrl,
      });
    } catch (error) {
      return toRouteErrorResponse(c, error);
    }
  });

  // Session APIs
  app.get('/api/sessions', (c) => runJsonRoute(c, listSessions(c.req.header('X-User-Id'))));
  app.post('/api/sessions', (c) =>
    runJsonRoute(c, createSession(c.req.raw, c.req.header('X-User-Id')), 201)
  );
  app.patch('/api/sessions/:id', (c) =>
    runJsonRoute(c, updateSession(c.req.raw, c.req.header('X-User-Id'), c.req.param('id')))
  );
  app.delete('/api/sessions/:id', (c) =>
    runJsonRoute(c, deleteSession(c.req.header('X-User-Id'), c.req.param('id')))
  );
  app.post('/api/sessions/:id/checkpoint', (c) =>
    runJsonRoute(c, checkpointSession(c.req.header('X-User-Id'), c.req.param('id')))
  );

  app.get('/api/sessions/:id/tabs', (c) =>
    runJsonRoute(c, listTabs(c.req.header('X-User-Id'), c.req.param('id')))
  );
  app.post('/api/sessions/:id/tabs', (c) =>
    runJsonRoute(c, createTab(c.req.raw, c.req.header('X-User-Id'), c.req.param('id')), 201)
  );
  app.patch('/api/sessions/:id/tabs/:tabId', (c) =>
    runJsonRoute(
      c,
      updateTab(
        c.req.raw,
        c.req.header('X-User-Id'),
        c.req.param('id'),
        c.req.param('tabId')
      )
    )
  );
  app.delete('/api/sessions/:id/tabs/:tabId', (c) =>
    runJsonRoute(
      c,
      deleteTab(c.req.header('X-User-Id'), c.req.param('id'), c.req.param('tabId'))
    )
  );

  app.get('/api/sessions/:id/ports', (c) =>
    runJsonRoute(c, listPorts(c.req.header('X-User-Id'), c.req.param('id')))
  );
  app.post('/api/sessions/:id/ports', (c) =>
    runJsonRoute(c, forwardPort(c.req.raw, c.req.header('X-User-Id'), c.req.param('id')), 201)
  );

  // Legacy compatibility routes
  app.get('/api/ports', (c) => runJsonRoute(c, listLegacyPorts(c.req.header('X-User-Id'))));
  app.post('/api/ports/forward', (c) =>
    runJsonRoute(c, forwardLegacyPort(c.req.raw, c.req.header('X-User-Id')))
  );
  app.get('/api/tabs', (c) => runJsonRoute(c, listLegacyTabs(c.req.header('X-User-Id'))));
  app.post('/api/tabs', (c) =>
    runJsonRoute(c, createLegacyTab(c.req.raw, c.req.header('X-User-Id')))
  );
  app.delete('/api/tabs/:id', (c) =>
    runJsonRoute(c, deleteLegacyTab(c.req.header('X-User-Id'), c.req.param('id')))
  );
  app.post('/api/backup', (c) =>
    runJsonRoute(c, backupWorkspace(c.req.header('X-User-Id')))
  );

  app.post('/api/share', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }
    const identity = readWorkerIdentity(c.req.raw.headers);

    const body = await c.req.raw
      .json<{ permissions?: 'read' | 'write' }>()
      .catch(() => ({}) as { permissions?: 'read' | 'write' });
    const shareToken = crypto.randomUUID();

    await c.env.USERS_KV.put(
      `share:${shareToken}`,
      JSON.stringify({
        userId,
        userEmail: identity?.userEmail ?? null,
        permissions: body.permissions || 'read',
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      })
    );

    const shareUrl = `/share/${shareToken}`;
    return c.json({ shareUrl, token: shareToken });
  });

  app.get('/api/ssh-keys', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    interface SSHKey {
      id: string;
      name: string;
      key: string;
      createdAt: number;
    }

    const keys = await c.env.USERS_KV.get(`ssh-keys:${userId}`);
    return c.json({ keys: keys ? (JSON.parse(keys) as SSHKey[]) : [] });
  });

  app.post('/api/ssh-keys', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    interface SSHKey {
      id: string;
      name: string;
      key: string;
      createdAt: number;
    }

    const body = await c.req.raw.json<{ name: string; key: string }>();
    const existing = await c.env.USERS_KV.get(`ssh-keys:${userId}`);
    const keys: SSHKey[] = existing ? (JSON.parse(existing) as SSHKey[]) : [];
    keys.push({ id: crypto.randomUUID(), name: body.name, key: body.key, createdAt: Date.now() });
    await c.env.USERS_KV.put(`ssh-keys:${userId}`, JSON.stringify(keys));

    return c.json({ success: true });
  });

  app.delete('/api/ssh-keys/:id', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    interface SSHKey {
      id: string;
      name: string;
      key: string;
      createdAt: number;
    }

    const existing = await c.env.USERS_KV.get(`ssh-keys:${userId}`);
    const keys: SSHKey[] = existing ? (JSON.parse(existing) as SSHKey[]) : [];
    const filtered = keys.filter((key) => key.id !== c.req.param('id'));
    await c.env.USERS_KV.put(`ssh-keys:${userId}`, JSON.stringify(filtered));

    return c.json({ success: true });
  });

  app.post('/api/recording/start', async (c) => {
    const authenticated = await requireUserId(c);
    if (authenticated instanceof Response) {
      return authenticated;
    }

    return c.json({ recording: true, startedAt: Date.now() });
  });

  app.post('/api/recording/stop', async (c) => {
    const authenticated = await requireUserId(c);
    if (authenticated instanceof Response) {
      return authenticated;
    }

    return c.json({ saved: true, stoppedAt: Date.now() });
  });

  // Public share lookup
  app.get('/api/share/:token', async (c) => {
    const shareToken = c.req.param('token');
    const shareData = await c.env.USERS_KV.get(`share:${shareToken}`);

    if (!shareData) {
      return c.json({ error: 'Invalid or expired share link' }, 404);
    }

    interface ShareData {
      userId: string;
      userEmail: string | null;
      permissions: string;
      expiresAt: number;
    }

    const data = JSON.parse(shareData) as ShareData;
    if (Date.now() > data.expiresAt) {
      return c.json({ error: 'Share link expired' }, 410);
    }

    return c.json({
      userId: data.userId,
      userEmail: data.userEmail,
      permissions: data.permissions,
    });
  });

  async function listFiles(c: Context<{ Bindings: Env }>) {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    const prefix = fileStoragePrefix(userId);

    try {
      const objects = await c.env.USER_DATA.list({ prefix });
      const files = objects.objects.map((object) => ({
        name: object.key.replace(prefix, '').split('/').pop() ?? object.key.replace(prefix, ''),
        size: object.size,
        modifiedAt: object.uploaded.getTime(),
        path: object.key.replace(prefix, ''),
      }));

      return c.json({ files });
    } catch {
      return c.json({ error: 'Failed to list files' }, 500);
    }
  }

  app.get('/api/files/list', listFiles);
  app.get('/api/files/tree', listFiles);

  app.post('/api/files/upload', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    const body = await c.req.parseBody();
    const file = body.file;
    const targetPath =
      typeof body.path === 'string' ? normalizeRelativeFilePath(body.path) : '';
    const activeSessionId =
      typeof body.sessionId === 'string' && body.sessionId.trim() !== ''
        ? body.sessionId.trim()
        : null;

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const relativePath = normalizeRelativeFilePath(
      targetPath ? `${targetPath}/${file.name}` : file.name
    );
    const key = buildFileStorageKey(userId, relativePath);
    const arrayBuffer = await file.arrayBuffer();

    try {
      await c.env.USER_DATA.put(key, arrayBuffer, {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
      });

      const shellVisible = await verifyShellVisibleFile(
        c.env,
        userId,
        activeSessionId,
        relativePath
      );

      return c.json({
        success: true,
        path: relativePath,
        name: file.name,
        size: file.size,
        shellVisible,
      });
    } catch {
      return c.json({ error: 'Failed to upload file' }, 500);
    }
  });

  app.get('/api/files/download/*', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    const requestPath = c.req.path.replace('/api/files/download/', '');
    const relativePath = normalizeRelativeFilePath(decodeURIComponent(requestPath));

    if (!relativePath) {
      return c.json({ error: 'File path is required' }, 400);
    }

    const key = buildFileStorageKey(userId, relativePath);

    try {
      const object = await c.env.USER_DATA.get(key);
      if (!object) {
        return c.json({ error: 'File not found' }, 404);
      }

      const headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
      headers.set('Content-Disposition', `attachment; filename="${relativePath.split('/').pop() ?? relativePath}"`);

      return new Response(object.body, { headers });
    } catch {
      return c.json({ error: 'Failed to download file' }, 500);
    }
  });

  app.get('/api/files/download/:name', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    const filename = normalizeRelativeFilePath(c.req.param('name'));
    const key = buildFileStorageKey(userId, filename);

    try {
      const object = await c.env.USER_DATA.get(key);
      if (!object) {
        return c.json({ error: 'File not found' }, 404);
      }

      const headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
      headers.set('Content-Disposition', `attachment; filename="${filename}"`);

      return new Response(object.body, { headers });
    } catch {
      return c.json({ error: 'Failed to download file' }, 500);
    }
  });

  return app;
}

const app = createApp();

/**
 * Guarded smoke route matching cloudflare/containers-demos/terminal worker:
 * `return await getContainer(binding).fetch(request)` on the browser request (minus `secret` query); DO `defaultPort` is 8080.
 * Enable with TERMINAL_PARITY_SECRET in deploy env + second container in alchemy.run.ts.
 */
function handleHelloWebSocket(request: Request): Response {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('expected websocket', {
      status: 426,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }

  const websocketPair = new WebSocketPair();
  const [client, server] = Object.values(websocketPair) as [WebSocket, WebSocket];
  server.accept();
  server.addEventListener('message', (event) => {
    const text = typeof event.data === 'string' ? event.data : String(event.data);
    server.send(`echo: ${text}`);
  });
  server.send('hello from worker');
  return new Response(null, { status: 101, webSocket: client });
}

function handleTerminalProbeWebSocket(request: Request): Response {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('expected websocket', {
      status: 426,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }

  const userId = request.headers.get('X-User-Id')?.trim();
  const sessionId = request.headers.get('X-Session-Id')?.trim();
  const tabId = request.headers.get('X-Tab-Id')?.trim();

  if (!userId) {
    return new Response('missing identity', { status: 401 });
  }

  const websocketPair = new WebSocketPair();
  const [client, server] = Object.values(websocketPair) as [WebSocket, WebSocket];
  server.accept();
  server.send(
    JSON.stringify({
      type: 'terminal-probe-ready',
      userId,
      sessionId,
      tabId,
    })
  );
  server.addEventListener('message', (event) => {
    const text = typeof event.data === 'string' ? event.data : String(event.data);
    server.send(`probe-echo: ${text}`);
  });
  return new Response(null, { status: 101, webSocket: client });
}

async function handleTerminalParitySmoke(request: Request, env: Env): Promise<Response> {
  const secret = env.TERMINAL_PARITY_SECRET;
  const ns = env.TerminalParity;
  if (!secret || !ns) {
    return new Response('Not found', { status: 404 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get('secret') !== secret) {
    return new Response('Not found', { status: 404 });
  }
  url.searchParams.delete('secret');
  const forward = new Request(url.toString(), request);
  console.log('[terminal-parity] demo-shaped stub.fetch', { pathname: url.pathname });
  try {
    return await getContainer(ns).fetch(forward);
  } catch (err) {
    console.error('[terminal-parity] stub.fetch threw', err);
    return toErrorResponse(
      new UnexpectedFailure({ message: 'Parity container fetch failed', cause: err })
    );
  }
}

async function handleTerminalWebSocket(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  console.log('[ws/terminal] incoming (raw)', {
    hasTicket: Boolean(url.searchParams.get('ticket')),
    querySessionId: url.searchParams.get('sessionId'),
    queryTabId: url.searchParams.get('tabId'),
    hasUserHeader: Boolean(request.headers.get('X-User-Id')),
  });

  try {
    // containers-demos/terminal: `return await getContainer(env.TERMINAL).fetch(request)` — no Effect around stub.fetch.
    const prep = await runRequestEffect(
      env,
      prepareTerminalForWebSocketContext({
        request,
        upgrade: request.headers.get('Upgrade') ?? undefined,
        userIdHeader: request.headers.get('X-User-Id'),
        ticket: url.searchParams.get('ticket'),
        requestedSessionId: url.searchParams.get('sessionId'),
        requestedTabId: url.searchParams.get('tabId'),
      })
    );

    const t0 = Date.now();
    const inner = buildContainerWebSocketRequest(request, prep.username, prep.sessionId, prep.tabId);
    let res: Response;
    try {
      res = await prep.ready.container.fetch(inner);
    } catch (err) {
      console.error('[ws/terminal] DO stub.fetch threw', { ms: Date.now() - t0, err });
      return toErrorResponse(
        new UnexpectedFailure({
          message: 'Container error, please retry in a moment.',
          cause: err,
        })
      );
    }

    const ws = (res as { webSocket?: WebSocket }).webSocket;
    console.log('[ws/terminal] direct stub.fetch', {
      status: res.status,
      hasWebSocket: ws != null,
      ms: Date.now() - t0,
      containerId: prep.ready.containerId,
    });
    // Do NOT call ws.accept() here: the Workers runtime forbids accepting a
    // WebSocket and then returning it in a Response (raises "Can't return
    // WebSocket in a Response after calling accept()"). The Container base
    // class has already configured the server-side end; we just relay the
    // 101 Response (which carries the paired client-side WebSocket) back to
    // the app-host proxy, which returns it to the browser.
    //
    // Pre-fix, this swallow-and-log path made the terminal appear connected
    // (the 101 reached the browser) but no PTY bytes flowed because the
    // server-side WebSocket got short-circuited by the spurious accept().
    if (res.status >= 400 || (res.status !== 101 && ws == null)) {
      const peek = await res.clone().text().catch(() => '');
      console.log('[ws/terminal] non-upgrade response body', peek.slice(0, 400));
    }
    return res;
  } catch (error) {
    return toErrorResponse(error);
  }
}

export { createApp };
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/terminal' && request.method === 'GET') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response(
          'WebSocket only: wss://<api-host>/terminal?secret=<TERMINAL_PARITY_SECRET> (optional parity smoke; set env + deploy)',
          { status: 426, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } }
        );
      }
      return handleTerminalParitySmoke(request, env);
    }
    if (url.pathname === '/ws/hello' && request.method === 'GET') {
      return handleHelloWebSocket(request);
    }
    if (url.pathname === '/ws/minimal' && request.method === 'GET') {
      return handleHelloWebSocket(request);
    }
    if (url.pathname === '/ws/terminal-probe' && request.method === 'GET') {
      return handleTerminalProbeWebSocket(request);
    }
    if (url.pathname === '/ws/terminal' && request.method === 'GET') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('expected websocket', {
          status: 426,
          headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
        });
      }
      return handleTerminalWebSocket(request, env);
    }
    return app.fetch(request, env, ctx);
  },
};
